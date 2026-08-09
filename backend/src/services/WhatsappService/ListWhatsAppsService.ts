import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number;
}

const ListWhatsAppsService = async ({
  companyId
}: Request): Promise<Whatsapp[]> => {
  const options: FindOptions = {
    attributes: [
      "id",
      "name",
      "channel",
      "status",
      "qrcode",
      "isDefault",
      // A tela precisa saber de qual marca é cada conexão para não oferecer
      // uma conexão da Nível quando o contexto é Fortmax. Sem isto na
      // projeção, o filtro por marca recebe `brandId: undefined` e não filtra.
      "brandId",
      "updatedAt"
    ],
    where: {
      companyId
    },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      }
    ],
    order: [["name", "ASC"]]
  };

  const whatsapps = await Whatsapp.findAll(options);

  return whatsapps;
};

export default ListWhatsAppsService;
