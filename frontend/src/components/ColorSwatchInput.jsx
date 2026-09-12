import { useEffect, useRef } from 'react';

// Önceki yaklaşım (native <input type="color"> üzerinde pseudo-element hack'leriyle daire
// yapmaya çalışmak) tarayıcılar arasında tutarsız ve kırılgandı. Standart/sağlam çözüm:
// gerçek native input'u tamamen GÖRÜNMEZ tut (sadece renk seçme diyaloğunu tetiklemek ve
// değeri tutmak için var), gördüğümüz daire ise sıradan bir <button> — tamamen kendi
// CSS'imizle çiziyoruz, tarayıcının renk kutusu render'ına hiç bağımlı değil.
//
// onChange (React'te native 'input' olayına bağlanır) tarayıcının kendi renk seçici
// penceresinde mouse basılı tutup gezdirirken SÜREKLİ tetikleniyor — canlı önizleme için
// bu istenen davranış. Ama "son kullanılan renkler" gibi TEK SEFERLİK bir kayıt yapılacaksa
// onChange'e bağlamak yanlış: her piksel için ayrı bir kayıt eklenir, sürüklemenin son
// birkaç adımı birbirine çok yakın tonlarda olduğu için geçmiş bu neredeyse-aynı renklerle
// dolup taşar. onCommit, native 'change' olayına bağlı — bu olay sadece seçim kesinleşince
// (renk penceresi kapanınca) BİR KERE ateşleniyor, React'in onChange'i gibi sürekli değil.
function ColorSwatchInput({ value, onChange, onCommit, title, className = '', rainbow = false, disabled = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || !onCommit) return undefined;
    const handleNativeChange = (e) => onCommit(e.target.value);
    el.addEventListener('change', handleNativeChange);
    return () => el.removeEventListener('change', handleNativeChange);
  }, [onCommit]);

  return (
    <span className={`color-swatch-input ${className}${disabled ? ' color-swatch-input-disabled' : ''}`}>
      <button
        type="button"
        className={`color-swatch-input-visual${rainbow ? ' color-swatch-input-rainbow' : ''}`}
        style={rainbow ? undefined : { background: value }}
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
        title={title}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="color-swatch-input-native"
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
}

export default ColorSwatchInput;
