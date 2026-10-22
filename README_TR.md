# Ruhsat Takip Pro — İlk sürüm

Bu paket, iPhone ana ekranına eklenebilecek PWA arayüzü ve Supabase bulut veritabanı bağlantısı için başlangıç dosyalarını içerir.

## Özellikler
- Müşteri kayıtları
- Ruhsat dosyaları: işyeri açma, inşaat ruhsatı/iskân, imar ve evrak takibi
- Dosya durumu ve evrak kontrol listesi
- Görev ve tarih takibi
- Tahsilat, gider, alacak ve yaklaşık net hesaplama
- Supabase e-posta/şifre hesabı ve kullanıcı başına veri erişim politikaları
- PWA manifest ve çevrimdışı arayüz önbelleği

## Önemli durum
Bu, ilk sürüm kaynak paketidir; internette yayımlanmış veya buluta bağlanmış hazır bir servis değildir. Uygulama ekranı çalışır, fakat verilerin buluta kaydedilmesi için Supabase projesi kurulmalı ve `app.js` içindeki bulut CRUD bağlantısı tamamlanmalıdır. Mevcut ilk sürümdeki kayıtlar demo/yerel kullanım içindir. Gerçek müşteri verilerini eklemeden önce kurulum ve güvenlik testleri yapılmalıdır.

## iPhone ana ekranına ekleme
PWA'nın HTTPS üzerinden yayımlanması gerekir:
1. Proje dosyalarını HTTPS destekleyen bir statik site barındırıcısına yükleyin.
2. Safari'de yayımlanan siteyi açın.
3. Paylaş > Ana Ekrana Ekle seçin.
4. Uygulamayı açıp giriş ve yedekleme durumunu test edin.

## Bulut kurulum planı (Supabase)
1. Supabase üzerinde yeni bir proje oluşturun.
2. SQL Editor'da `schema.sql` dosyasını çalıştırın.
3. Authentication ayarlarından e-posta/şifre girişini etkinleştirin.
4. Project URL ve yalnızca `publishable`/`anon` anahtarını uygulama ayarına girin. `service_role`/secret key'i asla istemci uygulamasına koymayın.
5. Uygulamayı HTTPS üzerinde yayımlayıp Supabase URL ve publishable/anon anahtarını giriş ekranına girin. Hesap oluşturun veya giriş yapın; tablolarla bağlantıyı test edin.
6. RLS'nin açık olduğunu ve iki ayrı test hesabının birbirinin verilerini okuyamadığını doğrulayın.
7. Gerçek müşteri verisi eklemeden önce yedekleme ve geri yükleme denemesi yapın.

## Güvenlik
- Kimlik, tapu, ruhsat, telefon gibi kişisel verileri gereksiz yere toplamayın.
- Müşteri evraklarını herkese açık depolama alanlarına yüklemeyin.
- Parolaları kendiniz saklamayın; Supabase Auth kullanın.
- Bulut veritabanında RLS politikaları zorunludur.
- Bu kaynak paketi kendi başına hukuki/vergi uyumluluğu garantisi vermez.
