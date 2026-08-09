import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import useBrands from "../../hooks/useBrands";

/**
 * Marca em contexto — vale para o sistema inteiro, não para uma tela só.
 *
 * Antes cada tela tinha o próprio estado de marca: dava para estar em Nível
 * nos tickets e ver tudo nas filas ao mesmo tempo. Agora a escolha é uma só,
 * feita no cabeçalho, e todas as telas leem daqui.
 *
 * `brandScopeId === null` significa "Todas" — e "todas" quer dizer as marcas
 * que ESTE usuário pode ver, porque a lista já chega filtrada pelo backend.
 *
 * A escolha persiste em `localStorage` por usuário: trocar de tela, recarregar
 * ou voltar no dia seguinte mantém o contexto de trabalho.
 */
const BrandScopeContext = createContext({
  brands: [],
  brandScopeId: null,
  setBrandScopeId: () => {},
  /** `[]` = sem filtro; `[id]` = uma marca. É o formato que as consultas usam. */
  brandScopeIds: [],
  isScoped: false
});

const storageKeyFor = userId => `ticketz:brandScope:${userId || "anon"}`;

export const BrandScopeProvider = ({ userId, children }) => {
  const { brands } = useBrands();
  const storageKey = storageKeyFor(userId);

  const [brandScopeId, setBrandScopeIdState] = useState(null);

  // Lê a preferência salva quando o usuário é conhecido. Fica fora do
  // `useState` inicial porque `userId` chega depois do primeiro render.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setBrandScopeIdState(saved ? Number(saved) : null);
    } catch {
      setBrandScopeIdState(null);
    }
  }, [storageKey]);

  const setBrandScopeId = useCallback(
    value => {
      const normalized =
        value === null || value === undefined ? null : Number(value);
      setBrandScopeIdState(normalized);
      try {
        if (normalized === null) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, String(normalized));
        }
      } catch {
        // Preferência é conforto, não requisito: se o storage falhar
        // (aba anônima, cota), o contexto segue valendo em memória.
      }
    },
    [storageKey]
  );

  /**
   * Uma marca que o usuário deixou de poder ver não pode continuar filtrando
   * por baixo — o resultado seria uma tela vazia sem explicação.
   */
  useEffect(() => {
    if (brandScopeId === null || !brands.length) {
      return;
    }
    const allowed = brands.some(
      brand => Number(brand.id) === Number(brandScopeId)
    );
    if (!allowed) {
      setBrandScopeId(null);
    }
  }, [brands, brandScopeId, setBrandScopeId]);

  const value = useMemo(
    () => ({
      brands,
      brandScopeId,
      setBrandScopeId,
      brandScopeIds: brandScopeId === null ? [] : [brandScopeId],
      isScoped: brandScopeId !== null
    }),
    [brands, brandScopeId, setBrandScopeId]
  );

  return (
    <BrandScopeContext.Provider value={value}>
      {children}
    </BrandScopeContext.Provider>
  );
};

export const useBrandScope = () => useContext(BrandScopeContext);

export default BrandScopeContext;
