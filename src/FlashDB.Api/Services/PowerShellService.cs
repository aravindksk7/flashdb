using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace FlashDB.Api.Services;

public interface IPowerShellService
{
    Task<T?> ExecuteCommandAsync<T>(string cmdlet, Dictionary<string, object>? parameters = null);
    Task<string> ExecuteCommandRawAsync(string cmdlet, Dictionary<string, object>? parameters = null);
}

public class PowerShellService : IPowerShellService
{
    private readonly ILogger<PowerShellService> _logger;
    private readonly string _flashdbModulePath;

    public PowerShellService(ILogger<PowerShellService> logger, IConfiguration config)
    {
        _logger = logger;
        _flashdbModulePath = config["FlashDB:ModulePath"] ??
            "C:\\flashdb\\src\\FlashDB\\FlashDB.psm1";
    }

    public async Task<T?> ExecuteCommandAsync<T>(string cmdlet, Dictionary<string, object>? parameters = null)
    {
        try
        {
            var result = await ExecuteCommandRawAsync(cmdlet, parameters);
            if (string.IsNullOrEmpty(result))
                return default;

            return JsonSerializer.Deserialize<T>(result, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing command {Cmdlet}", cmdlet);
            throw;
        }
    }

    public async Task<string> ExecuteCommandRawAsync(string cmdlet, Dictionary<string, object>? parameters = null)
    {
        var psCommand = BuildPowerShellCommand(cmdlet, parameters);

        _logger.LogInformation("Executing PowerShell command: {Command}", cmdlet);

        var psi = new ProcessStartInfo
        {
            FileName = "pwsh",
            Arguments = $"-NoProfile -Command \"{psCommand}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8
        };

        using (var process = Process.Start(psi))
        {
            if (process == null)
                throw new InvalidOperationException("Failed to start PowerShell process");

            var output = await process.StandardOutput.ReadToEndAsync();
            var error = await process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                _logger.LogError("PowerShell command failed: {Error}", error);
                throw new InvalidOperationException($"PowerShell error: {error}");
            }

            return output.Trim();
        }
    }

    private string BuildPowerShellCommand(string cmdlet, Dictionary<string, object>? parameters)
    {
        var cmd = $"Import-Module '{_flashdbModulePath}'; ";
        cmd += cmdlet;

        if (parameters != null && parameters.Count > 0)
        {
            var paramString = string.Join(" ", parameters.Select(kvp =>
                $"-{kvp.Key} '{EscapePowerShellString(kvp.Value?.ToString() ?? "")}'"));
            cmd += $" {paramString}";
        }

        cmd += " | ConvertTo-Json -Depth 10";
        return cmd;
    }

    private string EscapePowerShellString(string value)
    {
        return value.Replace("'", "''").Replace("\"", "\\\"");
    }
}
