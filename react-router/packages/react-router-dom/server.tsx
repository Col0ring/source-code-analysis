/**
 * 服务器端，ssr 路由
 * StaticRouter 实际上就是一个只提供参数传递，没有任何 navigator 操作的 Router
 */
import * as React from "react";
import { Action, Location, To, createPath, parsePath } from "history";
import { Router } from "react-router-dom";

export interface StaticRouterProps {
  basename?: string;
  children?: React.ReactNode;
  location: Partial<Location> | string;
}

/**
 * 没有任何操作，只是简单对 location 做验证，然后传入到 Router 中
 * A <Router> that may not transition to any other location. This is useful
 * on the server where there is no stateful UI.
 */
export function StaticRouter({
  basename,
  children,
  location: locationProp = "/"
}: StaticRouterProps) {
  // 转换为 location 对象
  if (typeof locationProp === "string") {
    locationProp = parsePath(locationProp);
  }

  // 所有 action 都是 Pop
  let action = Action.Pop;
  let location: Location = {
    pathname: locationProp.pathname || "/",
    search: locationProp.search || "",
    hash: locationProp.hash || "",
    state: locationProp.state || null,
    key: locationProp.key || "default"
  };

  let staticNavigator = {
    createHref(to: To) {
      // createPath 格式化 path
      return typeof to === "string" ? to : createPath(to);
    },
    push(to: To) {
      throw new Error(
        `You cannot use navigator.push() on the server because it is a stateless ` +
          `environment. This error was probably triggered when you did a ` +
          `\`navigate(${JSON.stringify(to)})\` somewhere in your app.`
      );
    },
    replace(to: To) {
      throw new Error(
        `You cannot use navigator.replace() on the server because it is a stateless ` +
          `environment. This error was probably triggered when you did a ` +
          `\`navigate(${JSON.stringify(to)}, { replace: true })\` somewhere ` +
          `in your app.`
      );
    },
    go(delta: number) {
      throw new Error(
        `You cannot use navigator.go() on the server because it is a stateless ` +
          `environment. This error was probably triggered when you did a ` +
          `\`navigate(${delta})\` somewhere in your app.`
      );
    },
    back() {
      throw new Error(
        `You cannot use navigator.back() on the server because it is a stateless ` +
          `environment.`
      );
    },
    forward() {
      throw new Error(
        `You cannot use navigator.forward() on the server because it is a stateless ` +
          `environment.`
      );
    }
  };

  return (
    <Router
      basename={basename}
      children={children}
      location={location}
      navigationType={action}
      navigator={staticNavigator}
      static={true}
    />
  );
}
