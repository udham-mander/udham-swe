# flash-on-done (udham-swe plugin) - Windows only.
# Flashes a translucent colored overlay over the Windows Terminal window
# that hosts this Claude Code session. Launched by hooks/on-stop.sh.
# Documentation: docs/flash-on-done.md
#
# Hook mode (default): reads hook JSON on stdin, applies the skip rules, then
# spawns a detached copy of itself (-Loop) and exits immediately, so the hook's
# timeout never kills the repeating flash.
# Loop mode (-Loop): flashes every -RepeatSeconds until the user touches the
# mouse/touchpad/keyboard, or -MaxMinutes passes.
param(
    [string]$Color = "LimeGreen",
    [double]$Opacity = 0.35,
    [int]$Flashes = 3,           # quick blinks per burst
    [int]$OnMs = 180,
    [int]$OffMs = 120,
    [int]$MinTurnSeconds = 5,    # skip replies faster than this
    [int]$IdleSeconds = 5,       # skip if input happened within this window
    [int]$RepeatSeconds = 5,     # time between bursts
    [int]$MaxMinutes = 30,       # give up after this long
    [switch]$Loop,
    [string]$SessionId = "default",
    [uint32]$TerminalPid = 0,    # set by hook mode for the detached loop
    [string]$DataDir = ""        # prompt timestamps + cached DLL; set by on-stop.sh
)

$ErrorActionPreference = "Stop"

# State lives outside the plugin folder (which may be replaced on update).
if (-not $DataDir) {
    $base = if ($env:CLAUDE_PLUGIN_DATA) { $env:CLAUDE_PLUGIN_DATA } else { Join-Path $env:USERPROFILE ".claude\udham-swe-data" }
    $DataDir = Join-Path $base "flash"
}
New-Item -ItemType Directory -Force $DataDir | Out-Null

Add-Type -Namespace FlashIdle -Name Native -MemberDefinition @"
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
public static uint LastInputTick() {
    var i = new LASTINPUTINFO(); i.cbSize = (uint)Marshal.SizeOf(i);
    GetLastInputInfo(ref i);
    return i.dwTime;
}
public static uint IdleMs() { return (uint)Environment.TickCount - LastInputTick(); }

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct PROCESSENTRY32 {
    public uint dwSize, cntUsage, th32ProcessID; public IntPtr th32DefaultHeapID;
    public uint th32ModuleID, cntThreads, th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
}
[DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref PROCESSENTRY32 e);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref PROCESSENTRY32 e);
[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

// Walk up the parent chain (one fast snapshot) to the hosting WindowsTerminal.exe; 0 if none.
public static uint FindAncestorTerminal(uint pid) {
    var parent = new System.Collections.Generic.Dictionary<uint, uint>();
    var name = new System.Collections.Generic.Dictionary<uint, string>();
    IntPtr snap = CreateToolhelp32Snapshot(0x2, 0);
    var e = new PROCESSENTRY32(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
    if (Process32FirstW(snap, ref e)) {
        do { parent[e.th32ProcessID] = e.th32ParentProcessID; name[e.th32ProcessID] = e.szExeFile; }
        while (Process32NextW(snap, ref e));
    }
    CloseHandle(snap);
    for (int i = 0; i < 20 && pid != 0 && name.ContainsKey(pid); i++) {
        if (string.Equals(name[pid], "WindowsTerminal.exe", StringComparison.OrdinalIgnoreCase)) return pid;
        pid = parent[pid];
    }
    return 0;
}
"@

# =========================== Hook mode ======================================
if (-not $Loop) {
    $sid = "default"
    try {
        $hookInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
        if ($hookInput.session_id) { $sid = $hookInput.session_id }
        # Skip check 1: reply was quick. UserPromptSubmit hook writes state/turn-<session_id>.
        $stamp = Join-Path $DataDir "turn-$sid"
        if (Test-Path $stamp) {
            $started = [long](Get-Content $stamp -Raw).Trim()
            if (([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $started) -lt $MinTurnSeconds) { exit 0 }
        }
    } catch { }  # no/invalid input (e.g. manual run): just flash

    # Skip check 2: user is active right now.
    if ([FlashIdle.Native]::IdleMs() -lt ($IdleSeconds * 1000)) { exit 0 }

    # Find our terminal now: the detached loop's parent (us) will be gone.
    $wt = [FlashIdle.Native]::FindAncestorTerminal([uint32]$PID)

    # Hand off to a detached loop process, forwarding all tuning parameters.
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
        "-File", "`"$PSCommandPath`"", "-Loop", "-SessionId", "`"$sid`"", "-TerminalPid", $wt,
        "-Color", $Color, "-Opacity", $Opacity, "-Flashes", $Flashes, "-OnMs", $OnMs,
        "-OffMs", $OffMs, "-RepeatSeconds", $RepeatSeconds, "-MaxMinutes", $MaxMinutes,
        "-DataDir", "`"$DataDir`"")
    Start-Process powershell.exe -ArgumentList $argList -WindowStyle Hidden
    exit 0
}

# =========================== Loop mode ======================================
# One flasher per session: a newer reply while flashing doesn't stack loops.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\ClaudeFlash-$SessionId", [ref]$created)
if (-not $created) { exit 0 }

$source = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public static class FlashNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);

    // Prefer the foreground terminal window; otherwise the first visible one.
    public static IntPtr FindTerminalWindow(uint[] pids) {
        IntPtr fg = GetForegroundWindow();
        if (IsTerminal(fg, pids)) return fg;
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            if (IsTerminal(h, pids) && IsWindowVisible(h) && !IsIconic(h)) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static bool IsTerminal(IntPtr h, uint[] pids) {
        if (h == IntPtr.Zero) return false;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (Array.IndexOf(pids, pid) < 0) return false;
        var sb = new StringBuilder(256); GetClassName(h, sb, 256);
        return sb.ToString() == "CASCADIA_HOSTING_WINDOW_CLASS";
    }
}

// Borderless, click-through, never steals focus, hidden from taskbar/alt-tab.
public class FlashOverlay : Form {
    public FlashOverlay() {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
        get {
            var cp = base.CreateParams;
            // WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST
            cp.ExStyle |= 0x80000 | 0x20 | 0x80 | 0x8000000 | 0x8;
            return cp;
        }
    }
}
"@

# Compile the helper once and cache it; recompile only when this script changes.
$dll = Join-Path $DataDir "flash-native.dll"
if (-not (Test-Path $dll) -or (Get-Item $dll).LastWriteTime -lt (Get-Item $PSCommandPath).LastWriteTime) {
    Remove-Item $dll -ErrorAction SilentlyContinue
    Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition $source -OutputAssembly $dll
}
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Path $dll

# Physical-pixel coordinates so the overlay lines up on scaled displays.
[FlashNative]::SetProcessDPIAware() | Out-Null

# The Windows Terminal hosting this session (found by hook mode); fall back to any.
$pids = @()
if ($TerminalPid) { $pids = @($TerminalPid) }
if (-not $pids) { $pids = @(Get-Process WindowsTerminal -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id }) }
if (-not $pids) { exit 0 }

$form = New-Object FlashOverlay
$form.BackColor = [System.Drawing.Color]::FromName($Color)
$form.Opacity = $Opacity

# Any input after this tick means the user is back: stop.
$startTick = [FlashIdle.Native]::LastInputTick()
function UserIsBack { [FlashIdle.Native]::LastInputTick() -ne $startTick }

$deadline = (Get-Date).AddMinutes($MaxMinutes)
while ((Get-Date) -lt $deadline -and -not (UserIsBack)) {
    # Re-locate each burst: the window may have moved, resized, or closed.
    $hwnd = [FlashNative]::FindTerminalWindow([uint32[]]$pids)
    if ($hwnd -eq [IntPtr]::Zero) { break }
    if (-not [FlashNative]::IsIconic($hwnd)) {
        $r = New-Object FlashNative+RECT
        [FlashNative]::GetWindowRect($hwnd, [ref]$r) | Out-Null
        $form.Bounds = New-Object System.Drawing.Rectangle($r.Left, $r.Top, ($r.Right - $r.Left), ($r.Bottom - $r.Top))
        for ($n = 0; $n -lt $Flashes -and -not (UserIsBack); $n++) {
            $form.Show(); [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds $OnMs
            $form.Hide(); [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds $OffMs
        }
    }
    # Wait for the next burst, checking for input every 200 ms.
    $next = (Get-Date).AddSeconds($RepeatSeconds)
    while ((Get-Date) -lt $next -and -not (UserIsBack)) { Start-Sleep -Milliseconds 200 }
}

$form.Dispose()
$mutex.ReleaseMutex()
