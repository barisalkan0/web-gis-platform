using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LocationsController : ApiControllerBase
{
    private readonly ILocationService _locationService;

    public LocationsController(ILocationService locationService, ILogger<LocationsController> logger) : base(logger)
    {
        _locationService = locationService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var locations = await _locationService.GetAllAsync();
            return Ok(locations);
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Konumlar listelenemedi.");
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLocationDto dto)
    {
        try
        {
            var created = await _locationService.CreateAsync(dto);
            return CreatedAtAction(nameof(GetAll), new { id = created.Id }, created);
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Konum oluşturulamadı.");
        }
    }
}