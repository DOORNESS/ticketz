import React from "react";

import { makeStyles } from "@material-ui/core/styles";
import Container from "@material-ui/core/Container";

const useStyles = makeStyles(theme => ({
  mainContainer: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(4),
    boxSizing: "border-box"
  },

  contentWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
    width: "100%"
  }
}));

const MainContainer = ({ children }) => {
  const classes = useStyles();

  return (
    <Container
      className={classes.mainContainer}
      maxWidth={false}
      disableGutters
    >
      <div className={classes.contentWrapper}>{children}</div>
    </Container>
  );
};

export default MainContainer;
