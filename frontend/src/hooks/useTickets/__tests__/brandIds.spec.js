import React from "react";
import { render, waitFor } from "@testing-library/react";

import useTickets from "../index";
import api from "../../../services/api";
import { invalidateTicketsCache } from "../../../helpers/ticketsListCache";

jest.mock("../../../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock("../../../errors/toastError", () => ({
  __esModule: true,
  default: jest.fn()
}));

const Probe = props => {
  useTickets(props);
  return null;
};

/**
 * O escopo de marca precisa chegar ao backend.
 *
 * O bug: `TicketsListCustom` mandava `brandIds` para o hook, mas o hook não
 * desestruturava a chave — o parâmetro sumia antes do `api.get`, a query voltava
 * com todas as marcas e a lista só era podada no cliente, onde os caminhos de
 * socket ainda reinseriam ticket de outra marca.
 */
describe("useTickets propaga o escopo de marca", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { tickets: [] } });
    invalidateTicketsCache();
  });

  const baseProps = {
    status: "open",
    queueIds: "[]",
    whatsappIds: "[]"
  };

  it("envia brandIds na querystring de /tickets", async () => {
    render(<Probe {...baseProps} brandIds="[2]" />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(api.get).toHaveBeenCalledWith(
      "/tickets",
      expect.objectContaining({
        params: expect.objectContaining({ brandIds: "[2]" })
      })
    );
  });

  it("trocar de marca dispara nova busca, não reaproveita o cache da anterior", async () => {
    const { rerender } = render(<Probe {...baseProps} brandIds="[2]" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    api.get.mockResolvedValue({ data: { tickets: [] } });
    rerender(<Probe {...baseProps} brandIds="[3]" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    expect(api.get.mock.calls[1][1].params.brandIds).toBe("[3]");
  });
});
