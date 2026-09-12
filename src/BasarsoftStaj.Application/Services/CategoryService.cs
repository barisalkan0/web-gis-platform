using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class CategoryService : ICategoryService
{
    private readonly IRepository<Category> _repository;
    private readonly IAuditLogService _auditLogService;

    public CategoryService(IRepository<Category> repository, IAuditLogService auditLogService)
    {
        _repository = repository;
        _auditLogService = auditLogService;
    }

    public async Task<IEnumerable<CategoryDto>> GetAllAsync()
    {
        var items = await _repository.GetAllAsync();
        return items.OrderBy(c => c.Name).Select(ToDto);
    }

    public async Task<(bool Success, CategoryDto? Result, string? Error)> CreateAsync(CreateCategoryDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
        {
            return (false, null, "Kategori adı boş olamaz.");
        }

        var existing = await _repository.FindAsync(c => c.Name == dto.Name.Trim());
        if (existing != null)
        {
            return (false, null, "Bu isimde bir kategori zaten var.");
        }

        var category = new Category
        {
            Name = dto.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            Color = string.IsNullOrWhiteSpace(dto.Color) ? "#6b7280" : dto.Color.Trim(),
            CreatedByUsername = actorUsername,
        };

        await _repository.AddAsync(category);
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "category.create", $"'{category.Name}' kategorisi oluşturuldu.");
        return (true, ToDto(category), null);
    }

    public async Task<(bool Success, string? Error)> UpdateAsync(int id, UpdateCategoryDto dto)
    {
        var category = await _repository.GetByIdAsync(id);
        if (category == null)
        {
            return (false, "Kategori bulunamadı.");
        }

        if (!string.IsNullOrWhiteSpace(dto.Name)) category.Name = dto.Name.Trim();
        if (dto.Description != null)
        {
            category.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        }
        if (!string.IsNullOrWhiteSpace(dto.Color)) category.Color = dto.Color.Trim();

        await _repository.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id)
    {
        var removed = await _repository.DeleteAsync(id);
        if (!removed)
        {
            return (false, "Kategori bulunamadı.");
        }

        await _repository.SaveChangesAsync();
        return (true, null);
    }

    private static CategoryDto ToDto(Category c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Description = c.Description,
        Color = c.Color,
        CreatedDate = c.CreatedDate,
        CreatedByUsername = c.CreatedByUsername,
    };
}
