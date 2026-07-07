import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

const Route = ({ component: Component, isPrivate = false, ...rest }) => {
  const { isAuth, loading, user } = useContext(AuthContext);
  const authReady = !isPrivate || (isAuth && Boolean(user?.id));
  const showLoading = loading || (isPrivate && isAuth && !user?.id);

  if (!isAuth && isPrivate) {
    return (
      <>
        {showLoading && <BackdropLoading />}
        <Redirect to={{ pathname: "/login", state: { from: rest.location } }} />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {showLoading && <BackdropLoading />}
        <Redirect to={{ pathname: "/", state: { from: rest.location } }} />
      </>
    );
  }

  if (!authReady) {
    return <BackdropLoading />;
  }

  return (
    <>
      {showLoading && <BackdropLoading />}
      <RouterRoute {...rest} component={Component} />
    </>
  );
};

export default Route;
