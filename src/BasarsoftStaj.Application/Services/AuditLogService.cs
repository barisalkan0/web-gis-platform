using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class AuditLogService : IAuditLogService
{
    private readonly IRepository<AuditLog> _repository;

    public AuditLogService(IRepository<AuditLog> repository)
    {
        _repository = repository;
    }

    public async Task LogAsync(string actorUsername, string action, string details, int? mapId = null)
    {
        await _repository.AddAsync(new AuditLog
        {
            ActorUsername = actorUsername,
            Action = action,
            Details = details,
            MapId = mapId,
        });
        await _repository.SaveChangesAsync();
    }

    public async Task<IEnumerable<AuditLogDto>> GetRecentAsync(int take = 200)
    {
        var items = await _repository.GetAllAsync();
        return items
            .OrderByDescending(l => l.CreatedDate)
            .Take(take)
            .Select(ToDto);
    }

    public async Task<PagedResultDto<AuditLogDto>> GetPageAsync(int page = 1, int pageSize = 25)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);
        var (items, totalCount) = await _repository.GetPageAsync(
            safePage,
            safePageSize,
            log => log.CreatedDate);

        return new PagedResultDto<AuditLogDto>
        {
            Items = items.Select(ToDto).ToList(),
            Page = safePage,
            PageSize = safePageSize,
            TotalCount = totalCount,
            TotalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)safePageSize),
        };
    }

    public async Task<IEnumerable<AuditLogDto>> GetForMapAsync(int mapId, int take = 100)
    {
        var items = await _repository.GetAllAsync();
        return items
            .Where(l => l.MapId == mapId)
            .OrderByDescending(l => l.CreatedDate)
            .Take(take)
            .Select(ToDto);
    }

    private static AuditLogDto ToDto(AuditLog l) => new()
    {
        Id = l.Id,
        ActorUsername = l.ActorUsername,
        Action = l.Action,
        Details = l.Details,
        CreatedDate = l.CreatedDate,
    };
}
