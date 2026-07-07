import http from "http";
import gracefulShutdown from "http-graceful-shutdown";
import appFast, { ensureCoreRoutes } from "./appFast";
import { logger } from "./utils/logger";

if (!process.env.PORT) {
  logger.error("PORT environment variable is not set.");
  process.exit(1);
}

const HOST = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT);

async function startBackgroundServices() {
  const { StartAllWhatsAppsSessions } =
    await import("./services/WbotServices/StartAllWhatsAppsSessions");
  const Company = (await import("./models/Company")).default;
  const { startQueueProcess } = await import("./queues");
  const { checkOpenInvoices, payGatewayInitialize } =
    await import("./services/PaymentGatewayServices/PaymentGatewayServices");

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

async function runPostListenBootstrap(_server: http.Server) {
  const { i18nReady } =
    await import("./services/TranslationServices/i18nService");
  const { bootstrapAiPlatform } =
    await import("./services/AiServices/bootstrapAiPlatform");
  const { seedTurnstileSettingsFromEnv } =
    await import("./services/AuthServices/SeedTurnstileSettingsService");
  const { seedAiSettingsFromEnv } =
    await import("./services/AuthServices/SeedAiSettingsFromEnv");

  const bootstrapServices = async () => {
    await seedTurnstileSettingsFromEnv().catch(error => {
      logger.warn({ error }, "Turnstile settings sync skipped");
    });
    await seedAiSettingsFromEnv().catch(error => {
      logger.warn({ error }, "OpenAI settings sync skipped");
    });
    await bootstrapAiPlatform();
    await startBackgroundServices();
  };

  i18nReady
    .then(async () => {
      logger.trace("i18n initialized");
      await bootstrapServices();
    })
    .catch(async error => {
      logger.error(`i18n initialization failed: ${error.message}`);
      await bootstrapServices();
    });
}

function setupGracefulShutdown(server: http.Server) {
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
}

function setupProcessHandlers() {
  process.on("uncaughtException", err => {
    logger.error({ err }, `Uncaught Exception: ${err.message}`);
    if (
      err["code"] &&
      ["ERR_OSSL_BAD_DECRYPT", "ENOENT"].includes(err["code"])
    ) {
      return;
    }
    process.exit(1);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.on("unhandledRejection", (reason: any, promise) => {
    logger.debug({ promise, reason }, "Unhandled Rejection");
  });
}

const server = http.createServer(appFast);

server.listen(port, HOST, () => {
  logger.info(`Ticketz API listening on ${HOST}:${port} (fast shell)`);
});

setupGracefulShutdown(server);
setupProcessHandlers();

setImmediate(() => {
  ensureCoreRoutes()
    .then(async () => {
      const { initIO } = await import("./libs/socket");
      initIO(server);
      logger.info("Core routes attached (auth + public settings)");

      setImmediate(() => {
        import("./routes/heavyRoutes")
          .then(({ default: heavyRoutes }) => {
            appFast.use(heavyRoutes);
            logger.info("Heavy routes attached");
          })
          .catch(error => {
            logger.error({ error }, "Heavy routes failed to attach");
          });

        import("./app")
          .then(({ default: fullApp }) => {
            appFast.set("queues", fullApp.get("queues"));
          })
          .catch(error => {
            logger.warn({ error }, "Queue registry deferred");
          });
      });

      await runPostListenBootstrap(server);
    })
    .catch(error => {
      logger.error(
        { error },
        `Failed to attach core routes: ${
          error instanceof Error ? error.message : error
        }`
      );
    });
});
