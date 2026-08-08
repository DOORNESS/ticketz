import { useEffect, useState } from "react";
import api from "../../services/api";

/**
 * Marcas que o usuário logado pode ver.
 *
 * O backend já devolve somente as permitidas — o hook não filtra nada por
 * conta própria, para que "Todas" no seletor signifique exatamente o mesmo
 * conjunto que o backend aplica nas consultas.
 */
const useBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const { data } = await api.get("/brands");
        if (active) {
          setBrands(Array.isArray(data) ? data : []);
        }
      } catch {
        // Marca é progressive enhancement: sem ela a lista segue funcionando
        // sem filtro, em vez de travar a tela de atendimento.
        if (active) {
          setBrands([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return { brands, loading };
};

export default useBrands;
