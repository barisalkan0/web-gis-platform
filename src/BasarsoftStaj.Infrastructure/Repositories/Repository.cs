using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Infrastructure.Data;

namespace BasarsoftStaj.Infrastructure.Repositories;

public class Repository<T> : IRepository<T> where T : class
{
    private readonly AppDbContext _context;
    private readonly DbSet<T> _dbSet;

    public Repository(AppDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(int id) => await _dbSet.FindAsync(id);
    public async Task<IEnumerable<T>> GetAllAsync() => await _dbSet.ToListAsync();
    public async Task<T?> FindAsync(Expression<Func<T, bool>> predicate) => await _dbSet.FirstOrDefaultAsync(predicate);

    public async Task<(IReadOnlyList<T> Items, int TotalCount)> GetPageAsync<TKey>(
        int page,
        int pageSize,
        Expression<Func<T, TKey>> orderByDescending,
        Expression<Func<T, bool>>? predicate = null)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);
        IQueryable<T> query = _dbSet.AsNoTracking();
        if (predicate != null) query = query.Where(predicate);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(orderByDescending)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task AddAsync(T entity) => await _dbSet.AddAsync(entity);

    public async Task<bool> DeleteAsync(int id)
    {
        var entity = await _dbSet.FindAsync(id);
        if (entity == null) return false;
        _dbSet.Remove(entity);
        return true;
    }

    public async Task SaveChangesAsync() => await _context.SaveChangesAsync();
}
