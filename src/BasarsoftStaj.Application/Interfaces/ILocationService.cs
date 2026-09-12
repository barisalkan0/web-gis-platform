using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Interfaces;

public interface ILocationService
{
    Task<Location> CreateAsync(CreateLocationDto dto);
    Task<IEnumerable<Location>> GetAllAsync();
}