using Microsoft.AspNetCore.Mvc;
using FlashDB.Api.Models;
using FlashDB.Api.Services;

namespace FlashDB.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ClonesController : ControllerBase
{
    private readonly ICloneService _cloneService;
    private readonly ILogger<ClonesController> _logger;

    public ClonesController(ICloneService cloneService, ILogger<ClonesController> logger)
    {
        _cloneService = cloneService;
        _logger = logger;
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse<CloneDto>>> CreateClone([FromBody] CreateCloneRequest request)
    {
        try
        {
            var clone = await _cloneService.CreateAsync(request);
            return CreatedAtAction(nameof(GetClone), new { id = clone.Id },
                new ApiResponse<CloneDto> { Success = true, Data = clone });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating clone");
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IEnumerable<CloneDto>>>> GetAllClones()
    {
        var clones = await _cloneService.GetAllAsync();
        return Ok(new ApiResponse<IEnumerable<CloneDto>>
        {
            Success = true,
            Data = clones
        });
    }

    [HttpGet("{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<CloneDto>>> GetClone(string id)
    {
        try
        {
            var clone = await _cloneService.GetByIdAsync(id);
            return Ok(new ApiResponse<CloneDto> { Success = true, Data = clone });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new ApiResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpPost("{id}/attach")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse>> AttachClone(string id, [FromBody] CloneActionRequest request)
    {
        try
        {
            await _cloneService.AttachAsync(id, request.InstancePath ?? "");
            return Ok(new ApiResponse { Success = true, Message = "Clone attached successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error attaching clone {CloneId}", id);
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpPost("{id}/detach")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse>> DetachClone(string id)
    {
        try
        {
            await _cloneService.DetachAsync(id);
            return Ok(new ApiResponse { Success = true, Message = "Clone detached successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detaching clone {CloneId}", id);
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse>> DeleteClone(string id, [FromQuery] bool deleteVhdx = false)
    {
        try
        {
            await _cloneService.DeleteAsync(id, deleteVhdx);
            return Ok(new ApiResponse { Success = true, Message = "Clone deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting clone {CloneId}", id);
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
        }
    }
}
