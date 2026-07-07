import React, { useEffect, useState } from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const AiLogs = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/ai/logs");
        setLogs(data.logs || []);
      } catch (err) {
        toastError(err);
      }
    };
    load();
  }, []);

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Logs</Title>
      </MainHeader>
      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Ticket</TableCell>
              <TableCell>Pergunta</TableCell>
              <TableCell>Resposta</TableCell>
              <TableCell>Modelo</TableCell>
              <TableCell>Transferido</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell>
                  {new Date(log.createdAt).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>{log.ticketId}</TableCell>
                <TableCell>{log.userMessage}</TableCell>
                <TableCell>{log.aiResponse}</TableCell>
                <TableCell>{log.model}</TableCell>
                <TableCell>
                  {log.transferredToHuman ? (
                    <Chip size="small" label="Sim" color="secondary" />
                  ) : (
                    <Chip size="small" label="Não" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default AiLogs;
