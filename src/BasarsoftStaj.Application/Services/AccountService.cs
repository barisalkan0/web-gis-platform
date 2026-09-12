using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class AccountService : IAccountService
{
    private const string ConfirmationPhrase = "HESABIMI SİL";
    private const int RetentionDays = 30;

    private readonly IRepository<User> _userRepository;

    public AccountService(IRepository<User> userRepository)
    {
        _userRepository = userRepository;
    }

    public async Task<(bool Success, string? Error)> ChangePasswordAsync(string username, ChangePasswordDto dto)
    {
        var user = await _userRepository.FindAsync(u => u.Username == username && !u.IsDeleted);
        if (user == null)
        {
            return (false, "Kullanıcı bulunamadı.");
        }

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
        {
            return (false, "Mevcut şifre yanlış.");
        }

        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
        {
            return (false, "Yeni şifre en az 6 karakter olmalı.");
        }

        if (dto.NewPassword != dto.ConfirmNewPassword)
        {
            return (false, "Yeni şifreler eşleşmiyor.");
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        user.ModifiedDate = DateTime.UtcNow;
        await _userRepository.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteOwnAccountAsync(string username, DeleteAccountDto dto)
    {
        var user = await _userRepository.FindAsync(u => u.Username == username && !u.IsDeleted);
        if (user == null)
        {
            return (false, "Kullanıcı bulunamadı.");
        }

        if (!BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
        {
            return (false, "Şifre yanlış.");
        }

        if (!string.Equals(dto.ConfirmationPhrase?.Trim(), ConfirmationPhrase, StringComparison.OrdinalIgnoreCase))
        {
            return (false, $"Onay için tam olarak \"{ConfirmationPhrase}\" yazmalısınız.");
        }

        // 2FA henüz gerçek bir TOTP akışı değil (TwoFactorEnabled alanı hazır, doğrulama
        // mantığı "yakında"), o yüzden burada sadece alanın varlığını not düşüyoruz.
        user.IsDeleted = true;
        user.DeletedAt = DateTime.UtcNow;
        user.ModifiedDate = DateTime.UtcNow;
        await _userRepository.SaveChangesAsync();
        return (true, null);
    }

    public async Task<int> PurgeExpiredAsync()
    {
        var users = await _userRepository.GetAllAsync();
        var cutoff = DateTime.UtcNow.AddDays(-RetentionDays);
        var expired = users.Where(u => u.IsDeleted && u.DeletedAt != null && u.DeletedAt <= cutoff).ToList();

        foreach (var user in expired)
        {
            await _userRepository.DeleteAsync(user.Id);
        }

        if (expired.Count > 0)
        {
            await _userRepository.SaveChangesAsync();
        }

        return expired.Count;
    }
}
