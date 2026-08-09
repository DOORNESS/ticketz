import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TicketsWhatsappFilter from "../index";

jest.mock("../../../translate/i18n", () => ({
  i18n: { t: key => key }
}));

const WHATSAPPS = [
  { id: 1, name: "WebG3", brandId: 2 },
  { id: 3, name: "Nivel", brandId: 1 }
];

const NIVEL = [1];
const FORTMAX = [2];

/**
 * A combinação "Marca: Fortmax + WhatsApp: Nível" chegou a existir em
 * produção: o componente recebia `selectedBrandIds` do pai e nunca declarava
 * a prop, então a marca era descartada em silêncio. Estes casos existem para
 * que isso não volte.
 */
describe("filtro de WhatsApp respeita a marca em contexto", () => {
  it("mostra as duas conexões quando não há marca escolhida", () => {
    render(
      <TicketsWhatsappFilter
        whatsapps={WHATSAPPS}
        selectedWhatsappIds={[]}
        selectedBrandIds={[]}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("WebG3")).toBeInTheDocument();
    expect(screen.getByText("Nivel")).toBeInTheDocument();
  });

  it("com Fortmax em contexto, a conexão da Nível não é oferecida", () => {
    render(
      <TicketsWhatsappFilter
        whatsapps={WHATSAPPS}
        selectedWhatsappIds={[]}
        selectedBrandIds={FORTMAX}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("WebG3")).toBeInTheDocument();
    expect(screen.queryByText("Nivel")).not.toBeInTheDocument();
  });

  it("com Nível em contexto, a conexão da Fortmax não é oferecida", () => {
    render(
      <TicketsWhatsappFilter
        whatsapps={WHATSAPPS}
        selectedWhatsappIds={[]}
        selectedBrandIds={NIVEL}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("Nivel")).toBeInTheDocument();
    expect(screen.queryByText("WebG3")).not.toBeInTheDocument();
  });

  it("trocar de marca limpa a conexão que ficou incompatível", () => {
    const onChange = jest.fn();

    render(
      <TicketsWhatsappFilter
        whatsapps={WHATSAPPS}
        selectedWhatsappIds={[3]}
        selectedBrandIds={FORTMAX}
        onChange={onChange}
      />
    );

    // A conexão 3 é da Nível; com Fortmax em contexto ela sai do filtro em
    // vez de continuar restringindo por baixo, invisível na tela.
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
