using System.Linq.Expressions;

namespace BasarsoftStaj.Application.Interfaces;

public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id);
    Task<IEnumerable<T>> GetAllAsync();
    Task<T?> FindAsync(Expression<Func<T, bool>> predicate);
    Task<(IReadOnlyList<T> Items, int TotalCount)> GetPageAsync<TKey>(
        int page,
        int pageSize,
        Expression<Func<T, TKey>> orderByDescending,
        Expression<Func<T, bool>>? predicate = null);
    Task AddAsync(T entity);
    Task<bool> DeleteAsync(int id);
    Task SaveChangesAsync();
}
