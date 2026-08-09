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
  isScoped: false,
  /**
   * `false` até a preferência salva ter sido lida. Telas que mandam a marca
   * ao backend DEVEM esperar por isto — ver comentário no provider.
   */
  isReady: false
});

const readSavedScope = storageKey => {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? Number(saved) : null;
  } catch {
    return null;
  }
};

const storageKeyFor = userId => `ticketz:brandScope:${userId || "anon"}`;

export const BrandScopeProvider = ({ userId, children }) => {
  const { brands } = useBrands();
  const storageKey = storageKeyFor(userId);

  /**
   * Lê a preferência JÁ no primeiro render, não num efeito.
   *
   * Com a leitura num efeito havia uma janela em que o contexto valia `null`
   * enquanto a marca salva era outra. As telas que mandam a marca ao backend
   * disparavam a busca nessa janela, SEM filtro, e o resultado sem filtro
   * podia chegar depois do filtrado e sobrescrevê-lo — Replay e Logs abriam
   * mostrando a marca errada, e só se corrigiam ao trocar a marca na mão.
   */
  const [brandScopeId, setBrandScopeIdState] = useState(() =>
    readSavedScope(storageKeyFor(userId))
  );

  // `userId` pode chegar depois do primeiro render; quando a chave muda, a
  // preferência é relida. `isReady` marca que a leitura definitiva ocorreu.
  const [isReady, setIsReady] = useState(Boolean(userId));

  useEffect(() => {
    setBrandScopeIdState(readSavedScope(storageKey));
    setIsReady(true);
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
      isScoped: brandScopeId !== null,
      isReady
    }),
    [brands, brandScopeId, setBrandScopeId, isReady]
  );

  return (
    <BrandScopeContext.Provider value={value}>
      {children}
    </BrandScopeContext.Provider>
  );
};

export const useBrandScope = () => useContext(BrandScopeContext);

export default BrandScopeContext;
