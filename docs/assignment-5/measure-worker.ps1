param([Parameter(Mandatory)][string]$Device, [ValidateRange(5,86400)][int]$Seconds=180)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path 'backend/build/capture/netsentinel.exe').Path
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=$exe
$info.Arguments='--interface "'+$Device+'" - - - - -'
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.RedirectStandardInput=$true
$info.RedirectStandardOutput=$true
$info.EnvironmentVariables['NETSENTINEL_BUFFER']='256'
$proc=[Diagnostics.Process]::Start($info)
$watch=[Diagnostics.Stopwatch]::StartNew()
$next=0
$stopSent=$false
$final=$null
try {
  Write-Output 'wall_s,cpu_s,working_MiB,private_MiB,parsed,rejected,output_drops'
  while ($true) {
    $read=$proc.StandardOutput.ReadLineAsync()
    if (!$read.Wait(5000)) { throw 'No worker output for five seconds.' }
    if ($null -eq $read.Result) { break }
    $batch=$read.Result | ConvertFrom-Json
    if ($batch.captureState -eq 'PAUSED') { $final=$batch; break }
    if ($watch.Elapsed.TotalSeconds -ge $next) {
      $proc.Refresh()
      '{0:F3},{1:F6},{2:F3},{3:F3},{4},{5},{6}' -f $watch.Elapsed.TotalSeconds,$proc.TotalProcessorTime.TotalSeconds,($proc.WorkingSet64/1MB),($proc.PrivateMemorySize64/1MB),$batch.packetCount,$batch.rejected,$batch.outputDrops
      $next+=10
    }
    if (!$stopSent -and $watch.Elapsed.TotalSeconds -ge $Seconds) {
      $proc.StandardInput.WriteLine('stop')
      $proc.StandardInput.Close()
      $stopSent=$true
    }
  }
  if (!$proc.WaitForExit(5000) -or $proc.ExitCode -ne 0 -or !$stopSent -or !$final -or $final.failed) { throw 'Incomplete capture.' }
  [ordered]@{elapsed_s=$final.elapsedSeconds; parsed=$final.packetCount; rejected=$final.rejected; wire_bytes=$final.wireBytes; output_drops=$final.outputDrops; worker_cpu_s=$proc.TotalProcessorTime.TotalSeconds} | ConvertTo-Json -Compress
} finally {
  if (!$proc.HasExited) { $proc.Kill(); $proc.WaitForExit() }
  $proc.Dispose()
}
