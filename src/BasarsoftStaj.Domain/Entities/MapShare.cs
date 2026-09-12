namespace BasarsoftStaj.Domain.Entities;

// Faz 2: harita paylaşımı (kullanıcının kendi fikri — Faz 1a'nın devamı). Bir Map'in
// sahibi, ManageMultipleMaps iznine sahipse başka bir kullanıcıyı bu satırla davet eder.
// Aynı (MapId, InvitedUserId) çifti için tek satır tutulur — davet reddedilir/durdurulursa
// satır silinmez, Status güncellenir (geçmiş tarihler InvitedDate/RespondedDate'te kalır);
// yeniden davet edilirse aynı satır Pending'e döner (bkz. MapShareService.InviteAsync).
//
// Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim veya kişilere de
// paylaşabilelim"): bir satır artık ya bir KİŞİYE (InvitedUserId) ya da bir ROLE (RoleId)
// ait — GeoRestriction'daki aynı "tam olarak biri dolu" deseni (bkz. AppDbContext check
// constraint). Rol paylaşımında kabul/red YOK — roldeki HERKES otomatik erişir (bir role
// "davet" göndermenin/kabul ettirmenin bir anlamı yok, kim üye olursa erişir), bu yüzden
// rol satırları oluşturulur oluşturulmaz Status=Accepted olur (bkz. MapShareService.
// ShareWithRoleAsync). İzinler (CanView/CanDraw/CanDelete/CanEditOthers/AllowedColors)
// her iki tür için de aynı şekilde çalışır.
public class MapShare
{
    public int Id { get; set; }

    public int MapId { get; set; }
    public Map? Map { get; set; }

    public int? InvitedUserId { get; set; }
    public User? InvitedUser { get; set; }

    public int? RoleId { get; set; }
    public Role? Role { get; set; }

    public string Status { get; set; } = MapShareStatus.Pending;

    public DateTime InvitedDate { get; set; } = DateTime.UtcNow;

    // Kabul/red/durdurma anında damgalanır — kullanıcının "ne zaman oldu" isteği için.
    public DateTime? RespondedDate { get; set; }

    // ---- Faz 3 (kullanıcının kendi isteği) ----
    // true ise bu davetli, haritadaki BAŞKALARININ (sahip dahil herkesin) çizimlerini de
    // düzenleyebilir/silebilir — false (varsayılan) ise sadece kendi çizdiklerini.
    // Sahip her zaman her şeyi düzenleyebilir, bu alan onu etkilemez (bkz.
    // GeometryController.CanEditFeatureAsync).
    public bool CanEditOthers { get; set; } = false;

    // Bu davetlinin haritada çizim yaparken kullanabileceği renkler — virgülle ayrılmış
    // hex kodları (ör. "#2563eb,#dc2626"). null/boş = kısıtlama yok, istediği rengi kullanır.
    // Kullanıcı bazlı (her davetliye ayrı) — sahip her davetli için ayrı ayrı tanımlayabilir.
    public string? AllowedColors { get; set; }

    // ---- Faz 3.1 (kullanıcının ek isteği: "görüntüleme, silme, çizme ayrı izinler olsun") ----
    // CanView = false: "Duraklat" — davet/Status'a dokunmadan bu kişinin TÜM erişimini
    // (görüntüleme dahil) geçici olarak keser, tek tıkla geri açılabilir (bkz.
    // MapShareService.HasAcceptedAccessAsync — bu alanı da kontrol ediyor, yani her şeyin
    // ana kapısı burası). Kalıcı çıkarmak için hâlâ mevcut "Durdur/Sil" (RemoveAsync) var.
    public bool CanView { get; set; } = true;

    // Yeni nokta/çizgi/alan ekleyebilir mi. Varsayılan true — Faz 3'ün ilk halinde "kabul
    // eden herkes çizebilir" davranışıydı, bunu BOZMAMAK için varsayılan açık.
    public bool CanDraw { get; set; } = true;

    // Bir çizimi silebilir mi (kendisininkini HER ZAMAN; CanEditOthers ile birlikte
    // BAŞKASININKİNİ de). Varsayılan true — önceki "yazan her zaman kendi çizimini silebilir"
    // davranışını BOZMAMAK için.
    public bool CanDelete { get; set; } = true;

    // ---- Görev #77 (mid-turn ek istek, kullanıcının kendi cümlesi): "paylaşılan haritaları
    // sonradan arşive atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim
    // bir kullanıcı olarak." Bunlar SAHİBİN değil, DAVETLİNİN (InvitedUserId) kendi tercihleri
    // — bu yüzden CanView/CanDraw gibi sahibin ayarladığı alanlardan AYRI, sadece davetlinin
    // kendi PATCH edebildiği bir grup (bkz. MapShareController.UpdateRecipientPrefs). Rol
    // paylaşımlarında (RoleId dolu) anlamsız — sadece kişisel paylaşımlarda kullanılıyor.
    public bool RecipientIsFavorite { get; set; } = false;
    public bool RecipientIsArchived { get; set; } = false;
    public string? RecipientNote { get; set; }
}
