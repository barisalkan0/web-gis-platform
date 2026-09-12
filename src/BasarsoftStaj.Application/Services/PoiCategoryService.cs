using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi: "Hiyerarşik yapıda poi_category (Örn: Yeme-İçme → Restoran, Kafe) tablosu
// ekleyin. Tablo kendi içinde Parent-Child ilişkisini desteklemelidir."
public class PoiCategoryService : IPoiCategoryService
{
    private readonly IRepository<PoiCategory> _repository;
    private readonly IAuditLogService _auditLogService;

    public PoiCategoryService(IRepository<PoiCategory> repository, IAuditLogService auditLogService)
    {
        _repository = repository;
        _auditLogService = auditLogService;
    }

    public async Task<IEnumerable<PoiCategoryDto>> GetAllAsync()
    {
        var items = await _repository.GetAllAsync();
        return items.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).Select(ToDto);
    }

    public async Task<(bool Success, PoiCategoryDto? Result, string? Error)> CreateAsync(CreatePoiCategoryDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
        {
            return (false, null, "Kategori adı boş olamaz.");
        }
        if (dto.Description?.Trim().Length > 500)
        {
            return (false, null, "Kategori açıklaması en fazla 500 karakter olabilir.");
        }
        if (dto.Icon?.Trim().Length > 16)
        {
            return (false, null, "İkon en fazla 16 karakter olabilir.");
        }

        if (dto.ParentId != null)
        {
            var parent = await _repository.GetByIdAsync(dto.ParentId.Value);
            if (parent == null) return (false, null, "Seçilen üst kategori bulunamadı.");
        }

        var all = (await _repository.GetAllAsync()).ToList();
        var nextSortOrder = all.Where(c => c.ParentId == dto.ParentId).Select(c => c.SortOrder).DefaultIfEmpty(-1).Max() + 1;
        var category = new PoiCategory
        {
            Name = dto.Name.Trim(),
            Description = CleanOptional(dto.Description),
            ParentId = dto.ParentId,
            SortOrder = nextSortOrder,
            Icon = CleanOptional(dto.Icon),
        };

        await _repository.AddAsync(category);
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "poi_category.create", $"'{category.Name}' POI kategorisi oluşturuldu.");
        return (true, ToDto(category), null);
    }

    public async Task<(bool Success, string? Error)> UpdateAsync(int id, UpdatePoiCategoryDto dto, string actorUsername)
    {
        var all = (await _repository.GetAllAsync()).ToList();
        var category = all.FirstOrDefault(c => c.Id == id);
        if (category == null) return (false, "Kategori bulunamadı.");

        if (!string.IsNullOrWhiteSpace(dto.Name)) category.Name = dto.Name.Trim();
        if (dto.UpdateDescription)
        {
            if (dto.Description?.Trim().Length > 500) return (false, "Kategori açıklaması en fazla 500 karakter olabilir.");
            category.Description = CleanOptional(dto.Description);
        }
        if (dto.UpdateIcon)
        {
            if (dto.Icon?.Trim().Length > 16) return (false, "İkon en fazla 16 karakter olabilir.");
            category.Icon = CleanOptional(dto.Icon);
        }

        var previousParentId = category.ParentId;

        if (dto.MoveToRoot)
        {
            category.ParentId = null;
        }
        else if (dto.ParentId != null)
        {
            if (dto.ParentId.Value == id)
            {
                return (false, "Bir kategori kendi üst kategorisi olamaz.");
            }

            var newParent = await _repository.GetByIdAsync(dto.ParentId.Value);
            if (newParent == null) return (false, "Seçilen üst kategori bulunamadı.");

            // Döngü kontrolü: yeni üstten yukarı doğru çıkınca DÜZENLENEN kategoriye
            // (id) rastlarsak, bu bir atayı kendi torununun altına taşımak demektir —
            // sonsuz döngü/veri bütünlüğü bozulmasın diye reddedilir.
            if (await CreatesCycleAsync(id, dto.ParentId.Value))
            {
                return (false, "Bu taşıma bir döngü oluşturur (bir kategori kendi alt kategorisinin altına taşınamaz).");
            }

            category.ParentId = dto.ParentId.Value;
        }

        if (previousParentId != category.ParentId || dto.SortOrder != null)
        {
            NormalizeSiblings(all
                .Where(c => c.Id != id && c.ParentId == previousParentId)
                .OrderBy(c => c.SortOrder)
                .ThenBy(c => c.Name));

            var targetSiblings = all
                .Where(c => c.Id != id && c.ParentId == category.ParentId)
                .OrderBy(c => c.SortOrder)
                .ThenBy(c => c.Name)
                .ToList();
            var targetIndex = Math.Clamp(dto.SortOrder ?? targetSiblings.Count, 0, targetSiblings.Count);
            targetSiblings.Insert(targetIndex, category);
            NormalizeSiblings(targetSiblings);
        }

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "poi_category.update", $"'{category.Name}' POI kategorisi güncellendi.");
        return (true, null);
    }

    // candidateParentId'den başlayıp ParentId zincirini yukarı doğru takip eder; editingId'ye
    // rastlarsak döngü var demektir. Kategori sayısı küçük olduğu için basit bir döngüsel
    // yürüyüş yeterli, ekstra bir ağaç yapısına gerek yok.
    private async Task<bool> CreatesCycleAsync(int editingId, int candidateParentId)
    {
        var current = await _repository.GetByIdAsync(candidateParentId);
        var guard = 0; // olası bozuk veride sonsuz döngüye karşı güvenlik ağı
        while (current != null && guard++ < 100)
        {
            if (current.Id == editingId) return true;
            if (current.ParentId == null) return false;
            current = await _repository.GetByIdAsync(current.ParentId.Value);
        }
        return false;
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername)
    {
        var category = await _repository.GetByIdAsync(id);
        var removed = await _repository.DeleteAsync(id);
        if (!removed)
        {
            return (false, "Kategori bulunamadı.");
        }

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "poi_category.delete", $"'{category?.Name}' POI kategorisi silindi (alt kategoriler varsa en üst seviyeye taşındı).");
        return (true, null);
    }

    private static PoiCategoryDto ToDto(PoiCategory c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Description = c.Description,
        ParentId = c.ParentId,
        SortOrder = c.SortOrder,
        CreatedDate = c.CreatedDate,
        Icon = c.Icon,
    };

    private static string? CleanOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void NormalizeSiblings(IEnumerable<PoiCategory> siblings)
    {
        var index = 0;
        foreach (var sibling in siblings)
        {
            sibling.SortOrder = index++;
        }
    }
}
