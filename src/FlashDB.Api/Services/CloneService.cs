using FlashDB.Api.Models;
using Microsoft.Extensions.Logging;

namespace FlashDB.Api.Services;

public interface ICloneService
{
    Task<CloneDto> CreateAsync(CreateCloneRequest request);
    Task<IEnumerable<CloneDto>> GetAllAsync();
    Task<CloneDto> GetByIdAsync(string id);
    Task AttachAsync(string cloneId, string instancePath);
    Task DetachAsync(string cloneId);
    Task DeleteAsync(string cloneId, bool deleteVhdx = false);
}

public class CloneService : ICloneService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<CloneService> _logger;

    public CloneService(IPowerShellService psService, ILogger<CloneService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<CloneDto> CreateAsync(CreateCloneRequest request)
    {
        _logger.LogInformation("Creating clone: {CloneName}", request.CloneName);

        var parameters = new Dictionary<string, object>
        {
            { "GoldenImageId", request.GoldenImageId },
            { "CloneName", request.CloneName },
            { "InstancePath", request.InstancePath },
            { "StoragePath", request.StoragePath }
        };

        var result = await _psService.ExecuteCommandAsync<CloneDto>(
            "New-FlashdbClone", parameters);

        return result ?? throw new InvalidOperationException("Failed to create clone");
    }

    public async Task<IEnumerable<CloneDto>> GetAllAsync()
    {
        _logger.LogInformation("Retrieving all clones");

        var result = await _psService.ExecuteCommandAsync<CloneDto[]>(
            "Get-FlashdbClone");

        return result ?? Array.Empty<CloneDto>();
    }

    public async Task<CloneDto> GetByIdAsync(string id)
    {
        _logger.LogInformation("Retrieving clone: {CloneId}", id);

        var parameters = new Dictionary<string, object> { { "CloneId", id } };

        var result = await _psService.ExecuteCommandAsync<CloneDto>(
            "Get-FlashdbClone", parameters);

        return result ?? throw new KeyNotFoundException($"Clone not found: {id}");
    }

    public async Task AttachAsync(string cloneId, string instancePath)
    {
        _logger.LogInformation("Attaching clone: {CloneId} to {Instance}", cloneId, instancePath);

        var parameters = new Dictionary<string, object>
        {
            { "CloneId", cloneId },
            { "InstancePath", instancePath }
        };

        await _psService.ExecuteCommandRawAsync("Connect-FlashdbClone", parameters);
    }

    public async Task DetachAsync(string cloneId)
    {
        _logger.LogInformation("Detaching clone: {CloneId}", cloneId);

        var parameters = new Dictionary<string, object> { { "CloneId", cloneId } };
        await _psService.ExecuteCommandRawAsync("Disconnect-FlashdbClone", parameters);
    }

    public async Task DeleteAsync(string cloneId, bool deleteVhdx = false)
    {
        _logger.LogInformation("Deleting clone: {CloneId}", cloneId);

        var parameters = new Dictionary<string, object>
        {
            { "CloneId", cloneId },
            { "DeleteVhdx", deleteVhdx }
        };

        await _psService.ExecuteCommandRawAsync("Remove-FlashdbClone", parameters);
    }
}
