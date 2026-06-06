using FlashDB.Api.Models;
using Microsoft.Extensions.Logging;

namespace FlashDB.Api.Services;

public interface IGoldenImageService
{
    Task<GoldenImageDto> CreateAsync(CreateGoldenImageRequest request);
    Task<IEnumerable<GoldenImageDto>> GetAllAsync();
    Task<GoldenImageDto> GetByIdAsync(string id);
    Task UpdateAsync(string id, UpdateGoldenImageRequest request);
    Task DeleteAsync(string id);
}

public class GoldenImageService : IGoldenImageService
{
    private readonly IPowerShellService _psService;
    private readonly ILogger<GoldenImageService> _logger;

    public GoldenImageService(IPowerShellService psService, ILogger<GoldenImageService> logger)
    {
        _psService = psService;
        _logger = logger;
    }

    public async Task<GoldenImageDto> CreateAsync(CreateGoldenImageRequest request)
    {
        _logger.LogInformation("Creating golden image: {Name}", request.Name);

        var parameters = new Dictionary<string, object>
        {
            { "Name", request.Name },
            { "Version", request.Version },
            { "Method", request.Method },
            { "OutputPath", request.OutputPath }
        };

        if (!string.IsNullOrEmpty(request.BackupFile))
            parameters["BackupFile"] = request.BackupFile;

        if (!string.IsNullOrEmpty(request.SourceConnection))
            parameters["SourceConnection"] = request.SourceConnection;

        var result = await _psService.ExecuteCommandAsync<GoldenImageDto>(
            "New-FlashdbGoldenImage", parameters);

        return result ?? throw new InvalidOperationException("Failed to create golden image");
    }

    public async Task<IEnumerable<GoldenImageDto>> GetAllAsync()
    {
        _logger.LogInformation("Retrieving all golden images");

        var result = await _psService.ExecuteCommandAsync<GoldenImageDto[]>(
            "Get-FlashdbGoldenImage");

        return result ?? Array.Empty<GoldenImageDto>();
    }

    public async Task<GoldenImageDto> GetByIdAsync(string id)
    {
        _logger.LogInformation("Retrieving golden image: {Id}", id);

        var parameters = new Dictionary<string, object> { { "Id", id } };

        var result = await _psService.ExecuteCommandAsync<GoldenImageDto>(
            "Get-FlashdbGoldenImage", parameters);

        return result ?? throw new KeyNotFoundException($"Golden image not found: {id}");
    }

    public async Task UpdateAsync(string id, UpdateGoldenImageRequest request)
    {
        _logger.LogInformation("Updating golden image: {Id}", id);

        var parameters = new Dictionary<string, object> { { "GoldenImageId", id } };

        if (!string.IsNullOrEmpty(request.BackupFile))
            parameters["BackupFile"] = request.BackupFile;

        if (!string.IsNullOrEmpty(request.SourceConnection))
            parameters["SourceConnection"] = request.SourceConnection;

        await _psService.ExecuteCommandRawAsync("Update-FlashdbGoldenImage", parameters);
    }

    public async Task DeleteAsync(string id)
    {
        _logger.LogInformation("Deleting golden image: {Id}", id);

        var parameters = new Dictionary<string, object> { { "GoldenImageId", id } };
        await _psService.ExecuteCommandRawAsync("Remove-FlashdbGoldenImage", parameters);
    }
}
