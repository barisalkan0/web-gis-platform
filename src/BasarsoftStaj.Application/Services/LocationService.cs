using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class LocationService : ILocationService
{
    private readonly IRepository<Location> _repository;

    public LocationService(IRepository<Location> repository)
    {
        _repository = repository;
    }

    public async Task<Location> CreateAsync(CreateLocationDto dto)
    {
        var location = new Location
        {
            Name = dto.Name,
            Latitude = dto.Latitude,
            Longitude = dto.Longitude
        };

        await _repository.AddAsync(location);
        await _repository.SaveChangesAsync();
        return location;
    }

    public Task<IEnumerable<Location>> GetAllAsync() => _repository.GetAllAsync();
}