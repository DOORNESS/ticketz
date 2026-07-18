import React, { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { useAiPageStyles } from "../../components/Ai/shared";
import { AiMetricCard, AiSectionPaper } from "../../components/Ai/forms";

const formatUsd = value => `$${Number(value || 0).toFixed(4)}`;
const formatDate = value =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const AiDashboard = () => {
  const classes = useAiPageStyles();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data: response } = await api.get("/ai/dashboard");
        setData(response);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <MainContainer>
        <MainHeader>
          <Title>IA — Dashboard</Title>
        </MainHeader>
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      </MainContainer>
    );
  }

  const totals = data?.totals || {};
  const operational = data?.operational || {};

  const formatWaitSeconds = value =>
    value === null || value === undefined ? "—" : `${value}s`;

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Dashboard</Title>
      </MainHeader>

      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Visão executiva"
          subtitle="Resumo dos atendimentos automatizados pela IA."
        >
          <div className={classes.metricsGrid}>
            <AiMetricCard
              label="Total de atendimentos"
              value={totals.totalAttendances || 0}
            />
            <AiMetricCard
              label="Resolvidos pela IA"
              value={totals.resolvedByAi || 0}
            />
            <AiMetricCard
              label="Transferências p/ humano"
              value={totals.transferredToHuman || 0}
            />
            <AiMetricCard
              label="Taxa de resolução"
              value={`${totals.resolutionRate || 0}%`}
            />
            <AiMetricCard
              label="Custo estimado hoje"
              value={formatUsd(totals.estimatedCostTodayUsd)}
            />
            <AiMetricCard
              label="Custo estimado no mês"
              value={formatUsd(totals.estimatedCostMonthUsd)}
            />
            <AiMetricCard
              label="Tokens consumidos"
              value={`${totals.tokensInput || 0} in / ${totals.tokensOutput || 0} out`}
            />
            <AiMetricCard
              label="Tempo médio de resposta"
              value={
                totals.avgResponseTimeMs ? `${totals.avgResponseTimeMs}ms` : "—"
              }
              hint="Disponível quando métricas de latência forem registradas nos logs."
            />
          </div>
        </AiSectionPaper>

        <AiSectionPaper
          title="Operação IA ↔ Humano"
          subtitle="Métricas do fluxo híbrido de atendimento."
        >
          <div className={classes.metricsGrid}>
            <AiMetricCard
              label="Iniciados pela IA"
              value={operational.startedByAi || 0}
            />
            <AiMetricCard
              label="Resolvidos pela IA"
              value={operational.resolvedByAiTickets || 0}
            />
            <AiMetricCard
              label="Transferidos"
              value={operational.transferredTickets || 0}
            />
            <AiMetricCard
              label="Handoff pendente"
              value={operational.handoffPending || 0}
            />
            <AiMetricCard
              label="Taxa resolução IA"
              value={`${operational.aiResolutionRate || 0}%`}
            />
            <AiMetricCard
              label="Tempo médio até humano"
              value={formatWaitSeconds(operational.avgHandoffWaitSeconds)}
            />
            <AiMetricCard
              label="Humano atendendo"
              value={operational.humanHandling || 0}
            />
            <AiMetricCard
              label="Encerrados por humano"
              value={operational.closedByHuman || 0}
            />
            <AiMetricCard
              label="Tempo médio IA"
              value={
                operational.avgAiHandlingSeconds
                  ? `${operational.avgAiHandlingSeconds}s`
                  : "—"
              }
            />
            <AiMetricCard
              label="Economia estimada (horas)"
              value={operational.estimatedHoursSaved || 0}
            />
            <AiMetricCard
              label="Economia estimada (custo)"
              value={`$${Number(operational.estimatedCostSavedUsd || 0).toFixed(2)}`}
            />
            <AiMetricCard
              label="Áudios processados"
              value={operational.audioCount || 0}
            />
            <AiMetricCard
              label="Imagens processadas"
              value={operational.imageCount || 0}
            />
            <AiMetricCard
              label="Documentos processados"
              value={operational.documentCount || 0}
            />
            <AiMetricCard
              label="Satisfação (IA)"
              value={operational.aiSatisfactionAvg || "—"}
            />
            <AiMetricCard
              label="Satisfação (humano)"
              value={operational.humanSatisfactionAvg || "—"}
            />
          </div>
        </AiSectionPaper>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Handoffs por setor">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fila</TableCell>
                    <TableCell align="right">Qtd.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(operational.handoffsByQueue || []).length ? (
                    operational.handoffsByQueue.map(item => (
                      <TableRow key={item.queueName}>
                        <TableCell>{item.queueName}</TableCell>
                        <TableCell align="right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhum handoff registrado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>

          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Motivos de handoff">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Motivo</TableCell>
                    <TableCell align="right">Qtd.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(operational.handoffsByReason || []).length ? (
                    operational.handoffsByReason.map(item => (
                      <TableRow key={item.reason}>
                        <TableCell>{item.label}</TableCell>
                        <TableCell align="right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhum motivo registrado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Principais assuntos">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Pergunta / assunto</TableCell>
                    <TableCell align="right">Qtd.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.topTopics || []).length ? (
                    data.topTopics.map(item => (
                      <TableRow key={item.topic}>
                        <TableCell>{item.topic}</TableCell>
                        <TableCell align="right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhum assunto registrado ainda.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>

          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Documentos mais consultados">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Documento</TableCell>
                    <TableCell align="right">Consultas</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.topDocuments || []).length ? (
                    data.topDocuments.map(item => (
                      <TableRow key={item.documentTitle}>
                        <TableCell>{item.documentTitle}</TableCell>
                        <TableCell align="right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhum documento consultado ainda.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>
        </Grid>

        {data?.phase4 && (
          <AiSectionPaper
            title="Fase 4 — Tools, memória e orquestrador"
            subtitle="Métricas operacionais de ferramentas, memória de contato e roteamento."
          >
            <div className={classes.metricsGrid}>
              <AiMetricCard
                label="Execuções de tools"
                value={data.phase4.tools?.executions || 0}
              />
              <AiMetricCard
                label="Taxa de sucesso (tools)"
                value={`${data.phase4.tools?.successRate || 0}%`}
              />
              <AiMetricCard
                label="Execuções write"
                value={data.phase4.tools?.writeExecutions || 0}
              />
              <AiMetricCard
                label="Latência média (tools)"
                value={
                  data.phase4.tools?.avgLatencyMs != null
                    ? `${data.phase4.tools.avgLatencyMs}ms`
                    : "—"
                }
              />
              <AiMetricCard
                label="Memórias aplicadas (mês)"
                value={data.phase4.memory?.recordsApplied || 0}
              />
              <AiMetricCard
                label="Memórias ativas"
                value={data.phase4.memory?.activeRecords || 0}
              />
              <AiMetricCard
                label="Roteamentos"
                value={data.phase4.orchestrator?.routed || 0}
              />
              <AiMetricCard
                label="Confiança média"
                value={
                  data.phase4.orchestrator?.avgConfidence != null
                    ? `${(Number(data.phase4.orchestrator.avgConfidence) * 100).toFixed(0)}%`
                    : "—"
                }
              />
              <AiMetricCard
                label="Fallbacks"
                value={data.phase4.orchestrator?.fallbacks || 0}
              />
            </div>

            <Grid container spacing={2} style={{ marginTop: 8 }}>
              {(data.phase4.tools?.byTool || []).length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Tools por volume
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tool</TableCell>
                        <TableCell align="right">Execuções</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.phase4.tools.byTool.map(item => (
                        <TableRow key={item.toolId}>
                          <TableCell>{item.toolId}</TableCell>
                          <TableCell align="right">{item.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Grid>
              )}

              {(data.phase4.byAgent || []).length > 0 && (
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>
                    Por agente
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Agente</TableCell>
                        <TableCell align="right">Conversas</TableCell>
                        <TableCell align="right">Custo (USD)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.phase4.byAgent.map(item => (
                        <TableRow key={item.agentId}>
                          <TableCell>
                            {item.name || `#${item.agentId}`}
                          </TableCell>
                          <TableCell align="right">
                            {item.conversations || 0}
                          </TableCell>
                          <TableCell align="right">
                            {formatUsd(item.costUsd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Grid>
              )}
            </Grid>
          </AiSectionPaper>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Perguntas sem resposta">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Pergunta</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.unansweredQuestions || []).length ? (
                    data.unansweredQuestions.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                        <TableCell>{item.userMessage}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhuma pergunta pendente.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>

          <Grid item xs={12} md={6}>
            <AiSectionPaper title="Erros recentes">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Erro</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.recentErrors || []).length ? (
                    data.recentErrors.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                        <TableCell>{item.error}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography variant="body2" color="textSecondary">
                          Nenhum erro recente.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AiSectionPaper>
          </Grid>
        </Grid>
      </div>
    </MainContainer>
  );
};

export default AiDashboard;
