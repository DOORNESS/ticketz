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
