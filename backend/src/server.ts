import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import { startQueueProcess } from "./queues";
import {
  checkOpenInvoices,
  payGatewayInitialize
} from "./services/PaymentGatewayServices/PaymentGatewayServices";
import { i18nReady } from "./services/TranslationServices/i18nService";
import { bootstrapAiPlatform } from "./services/AiServices/bootstrapAiPlatform";
import { seedTurnstileSettingsFromEnv } from "./services/AuthServices/SeedTurnstileSettingsService";

// Environment Variable Validation
if (!process.env.PORT) {
  logger.error("PORT environment variable is not set.");
  process.exit(1);
}

const HOST = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT);

// Function to start server and initialize services
async function startServer() {
  try {
    const companies = await Company.findAll();
    const sessionPromises = companies.map(async company => {
      try {
        await StartAllWhatsAppsSessions(company.id);
        logger.info(`Started WhatsApp session for company ID: ${company.id}`);
      } catch (error) {
        logger.error(
          `Error starting WhatsApp session for company ID: ${company.id} - ${error.message}`
        );
      }
    });

    await Promise.all(sessionPromises);

    startQueueProcess();
    logger.info(`Background services started on port: ${process.env.PORT}`);

    try {
      await payGatewayInitialize();
    } catch (error) {
      logger.error(`Error initializing payment gateway: ${error.message}`);
    }

    checkOpenInvoices();
  } catch (error) {
    logger.error(`Error during server startup: ${error.message}`);
  }
}

// Listen immediately so container health checks pass; init i18n/services in background.
const server = app.listen(port, HOST, () => {
  logger.info(`Server is listening on ${HOST}:${port}`);
});

initIO(server);

setImmediate(() => {
  i18nReady
    .then(async () => {
      logger.trace("i18n initialized");
      await seedTurnstileSettingsFromEnv().catch(error => {
        logger.warn({ error }, "Turnstile settings sync skipped");
      });
      await bootstrapAiPlatform();
      await startServer();
    })
    .catch(async error => {
      logger.error(`i18n initialization failed: ${error.message}`);
      await seedTurnstileSettingsFromEnv().catch(seedError => {
        logger.warn({ error: seedError }, "Turnstile settings sync skipped");
      });
      await bootstrapAiPlatform();
      await startServer();
    });
});

gracefulShutdown(server, {
  signals: "SIGINT SIGTERM",
  timeout: 30000,
  onShutdown: async () => {
    logger.info("Shutdown initiated. Cleaning up...");
  },
  finally: () => {
    logger.info("Server has shut down.");
  }
});

// Global Exception Handlers
process.on("uncaughtException", err => {
  logger.error({ err }, `Uncaught Exception: ${err.message}`);
  if (err["code"] && ["ERR_OSSL_BAD_DECRYPT", "ENOENT"].includes(err["code"])) {
    return;
  }
  process.exit(1);
});

// Global Exception Handlers for logging only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (reason: any, promise) => {
  logger.debug({ promise, reason }, "Unhandled Rejection");
});
