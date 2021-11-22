/**
 * 总结：最重要的 api 是 useRoutes，Route 组件实际上只是提供 route 属性的工具而已，Routes 组件实际上内部只是对 useRoutes 的参数做一层转换，转换完成后可以得到一个 routes 数组（也可以直接使用 useRoutes 手动传入）。
 * useRoutes 内部会将传入的 routes 与当前的 location（可手动传入，但内部会做校验）做一层匹配，通过对 route 中声明的 path 的权重计算（在 route 中加入 index 属性实际上是为了增加权重，但是该权重并不大，如果有确定的路由路径就不会匹配上 indexRoute），拿到当前 pathname 所能匹配到的最佳 matches 数组，该数组为扁平化，索引从小到大级别关系从大到小，最大是根 route 所对应的 match，最小是当前 pathname 匹配最多的 route 所对应的 match。
 * 然后将 matches 数组渲染为一个聚合的 React Element，该元素整体是许多 RouteContext.Provider 的嵌套，从外到内依次是父 => 子 => 孙子这样的关系，每个 Provider 包含两个值，与该级别对应的 matches 数组（最后的元素时该级别的 route 自身）与 outlet 元素，outlet 元素就是嵌套的 RouteContext.Provider 存放的地方，每个 RouteContext.Provider 的 children 就是 route 的 element 属性。
 * 每次使用 outlet 实际上都是渲染的内置的路由关系（如果当前 route 没有 element 属性，则默认渲染 outlet，这也是为什么可以直接 <Route/> 组件嵌套的原因），我们可以在当前级别 route 的 element 中任意地方使用 outlet 来渲染子路由。
 */
import * as React from "react";
import type {
  History,
  InitialEntry,
  Location,
  MemoryHistory,
  Path,
  To
} from "history";
import {
  Action as NavigationType,
  createMemoryHistory,
  parsePath
} from "history";

export type { Location, Path, To, NavigationType };
/**
 * 断言
 */
function invariant(cond: any, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function warning(cond: any, message: string): void {
  if (!cond) {
    // eslint-disable-next-line no-console
    if (typeof console !== "undefined") console.warn(message);

    try {
      // Welcome to debugging React Router!
      //
      // This error is thrown as a convenience so you can more easily
      // find the source for a warning that appears in the console by
      // enabling "pause on exceptions" in your JavaScript debugger.
      throw new Error(message);
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
}

const alreadyWarned: Record<string, boolean> = {};
function warningOnce(key: string, cond: boolean, message: string) {
  if (!cond && !alreadyWarned[key]) {
    alreadyWarned[key] = true;
    warning(false, message);
  }
}

///////////////////////////////////////////////////////////////////////////////
// CONTEXT
///////////////////////////////////////////////////////////////////////////////

/**
 * A Navigator is a "location changer"; it's how you get to different locations.
 *
 * Every history instance conforms to the Navigator interface, but the
 * distinction is useful primarily when it comes to the low-level <Router> API
 * where both the location and a navigator must be provided separately in order
 * to avoid "tearing" that may occur in a suspense-enabled app if the action
 * and/or location were to be read directly from the history instance.
 */
export type Navigator = Omit<
  History,
  "action" | "location" | "back" | "forward" | "listen" | "block"
>;

interface NavigationContextObject {
  basename: string;
  navigator: Navigator;
  static: boolean;
}

/**
 * 管理 navigator 相关，官方不推荐在外直接使用
 */
const NavigationContext = React.createContext<NavigationContextObject>(null!);

if (__DEV__) {
  NavigationContext.displayName = "Navigation";
}

interface LocationContextObject {
  location: Location;
  navigationType: NavigationType;
}
/**
 * 包含当前的 location 与 action 的 type，官方不推荐在外直接使用
 */
const LocationContext = React.createContext<LocationContextObject>(null!);

if (__DEV__) {
  LocationContext.displayName = "Location";
}

interface RouteContextObject {
  outlet: React.ReactElement | null;
  matches: RouteMatch[];
}
/**
 * 包含全部匹配到的路由，官方不推荐在外直接使用
 */
const RouteContext = React.createContext<RouteContextObject>({
  outlet: null,
  matches: []
});

if (__DEV__) {
  RouteContext.displayName = "Route";
}

///////////////////////////////////////////////////////////////////////////////
// COMPONENTS
///////////////////////////////////////////////////////////////////////////////

export interface MemoryRouterProps {
  basename?: string;
  children?: React.ReactNode;
  initialEntries?: InitialEntry[];
  initialIndex?: number;
}

/**
 * A <Router> that stores all entries in memory.
 * react-router 里面只有 MemoryRouter，其余的 router 在 react-router-dom 里
 * @see https://reactrouter.com/docs/en/v6/api#memoryrouter
 */
export function MemoryRouter({
  basename,
  children,
  initialEntries,
  initialIndex
}: MemoryRouterProps): React.ReactElement {
  let historyRef = React.useRef<MemoryHistory>();
  if (historyRef.current == null) {
    // 创建 memoryHistory
    historyRef.current = createMemoryHistory({ initialEntries, initialIndex });
  }

  let history = historyRef.current;
  let [state, setState] = React.useState({
    action: history.action,
    location: history.location
  });

  // 监听 history 改变，改变后重新 setState
  React.useLayoutEffect(() => history.listen(setState), [history]);

  // 简单的初始化并将相应状态与 React 绑定
  return (
    <Router
      basename={basename}
      children={children}
      location={state.location}
      navigationType={state.action}
      navigator={history}
    />
  );
}

export interface NavigateProps {
  to: To;
  replace?: boolean;
  state?: any;
}

/**
 * Changes the current location.
 * 相当于集成了 v5 的 Redirect，再增加了 Push 的功能
 * Note: This API is mostly useful in React.Component subclasses that are not
 * able to use hooks. In functional components, we recommend you use the
 * `useNavigate` hook instead.
 *
 * @see https://reactrouter.com/docs/en/v6/api#navigate
 */
export function Navigate({ to, replace, state }: NavigateProps): null {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of
    // the router loaded. We can help them understand how to avoid that.
    `<Navigate> may be used only in the context of a <Router> component.`
  );

  warning(
    !React.useContext(NavigationContext).static,
    `<Navigate> must not be used on the initial render in a <StaticRouter>. ` +
      `This is a no-op, but you should modify your code so the <Navigate> is ` +
      `only ever rendered in response to some user interaction or state change.`
  );

  let navigate = useNavigate();
  React.useEffect(() => {
    navigate(to, { replace, state });
  });

  return null;
}

export interface OutletProps {}

/**
 * Renders the child route's element, if there is one.
 * 就是获取 context 上当前的 outlet
 * @see https://reactrouter.com/docs/en/v6/api#outlet
 */
export function Outlet(_props: OutletProps): React.ReactElement | null {
  return useOutlet();
}

export interface RouteProps {
  caseSensitive?: boolean;
  children?: React.ReactNode;
  element?: React.ReactElement | null;
  index?: boolean;
  path?: string;
}

export interface PathRouteProps {
  caseSensitive?: boolean;
  children?: React.ReactNode;
  element?: React.ReactElement | null;
  index?: false;
  path: string;
}

export interface LayoutRouteProps {
  children?: React.ReactNode;
  element?: React.ReactElement | null;
}

export interface IndexRouteProps {
  element?: React.ReactElement | null;
  index: true;
}

/**
 * Declares an element that should be rendered at a certain URL path.
 * Route 组件内部没有进行任何操作，主要是为了使用它的 props
 * @see https://reactrouter.com/docs/en/v6/api#route
 */
export function Route(
  _props: PathRouteProps | LayoutRouteProps | IndexRouteProps
): React.ReactElement | null {
  // 这里可以看出 Route 不能够被渲染出来，证明 Router 拿到 Route 后也不会再内部操作
  invariant(
    false,
    `A <Route> is only ever to be used as the child of <Routes> element, ` +
      `never rendered directly. Please wrap your <Route> in a <Routes>.`
  );
}

export interface RouterProps {
  basename?: string;
  children?: React.ReactNode;
  location: Partial<Location> | string;
  navigationType?: NavigationType;
  navigator: Navigator;
  static?: boolean;
}

/**
 * 提供渲染 Route 的上下文，但是一般不直接使用这个组件，会包装在 BrowserRouter 等二次封装的路由中
 * 整个应用程序应该只有一个 Router
 * Router 的作用就是格式化 location 与渲染 NavigationContext、LocationContext
 * Provides location context for the rest of the app.
 *
 * Note: You usually won't render a <Router> directly. Instead, you'll render a
 * router that is more specific to your environment such as a <BrowserRouter>
 * in web browsers or a <StaticRouter> for server rendering.
 *
 * @see https://reactrouter.com/docs/en/v6/api#router
 */
export function Router({
  basename: basenameProp = "/",
  children = null,
  // 必传，当前 location
  location: locationProp,
  navigationType = NavigationType.Pop,
  // 必传，history 对象，我们可以再这里传入统一外部的 history
  navigator,
  // 是否为静态路由（ssr）
  static: staticProp = false
}: RouterProps): React.ReactElement | null {
  // Router 不能在其余 Router 内部
  invariant(
    !useInRouterContext(),
    `You cannot render a <Router> inside another <Router>.` +
      ` You should never have more than one in your app.`
  );
  // 格式化 basename
  let basename = normalizePathname(basenameProp);
  let navigationContext = React.useMemo(
    () => ({ basename, navigator, static: staticProp }),
    [basename, navigator, staticProp]
  );

  // 转换 location
  if (typeof locationProp === "string") {
    locationProp = parsePath(locationProp);
  }

  let {
    pathname = "/",
    search = "",
    hash = "",
    state = null,
    key = "default"
  } = locationProp;

  // 经过抽离 base 后的真正的 location，如果抽离 base 失败返回 null
  let location = React.useMemo(() => {
    let trailingPathname = stripBasename(pathname, basename);

    if (trailingPathname == null) {
      return null;
    }

    return {
      pathname: trailingPathname,
      search,
      hash,
      state,
      key
    };
  }, [basename, pathname, search, hash, state, key]);

  warning(
    location != null,
    `<Router basename="${basename}"> is not able to match the URL ` +
      `"${pathname}${search}${hash}" because it does not start with the ` +
      `basename, so the <Router> won't render anything.`
  );

  if (location == null) {
    return null;
  }

  return (
    // 唯一传入 location 的地方
    <NavigationContext.Provider value={navigationContext}>
      <LocationContext.Provider
        children={children}
        value={{ location, navigationType }}
      />
    </NavigationContext.Provider>
  );
}

export interface RoutesProps {
  children?: React.ReactNode;
  location?: Partial<Location> | string;
}

/**
 * A container for a nested tree of <Route> elements that renders the branch
 * that best matches the current location.
 * 所有的 Route 都需要 Routes 包裹，用于渲染 Route（拿到 Route 的 props 的值，不渲染真实的 DOM 节点）
 * 其实本质上都是调用的 useRoutes，这里其实就是兼容 v5 的组件式调用方法，最后还是会将所有的 Route 转换为 route 对象
 * @see https://reactrouter.com/docs/en/v6/api#routes
 */
export function Routes({
  children,
  location
}: RoutesProps): React.ReactElement | null {
  return useRoutes(createRoutesFromChildren(children), location);
}

///////////////////////////////////////////////////////////////////////////////
// HOOKS
///////////////////////////////////////////////////////////////////////////////

/**
 * Returns the full href for the given "to" value. This is useful for building
 * custom links that are also accessible and preserve right-click behavior.
 * 主要为了通过当前的 pathname，基于上下文的 basename 合并为完整的 url，官方这边建议是用于自定义的 link 标签，这样可以自动添加 basename
 * @see https://reactrouter.com/docs/en/v6/api#usehref
 */
export function useHref(to: To): string {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useHref() may be used only in the context of a <Router> component.`
  );

  let { basename, navigator } = React.useContext(NavigationContext);
  let { hash, pathname, search } = useResolvedPath(to);

  let joinedPathname = pathname;
  // 拿到带 basename 的 href
  if (basename !== "/") {
    let toPathname = getToPathname(to);
    // 是否结尾带有 /
    let endsWithSlash = toPathname != null && toPathname.endsWith("/");
    joinedPathname =
      pathname === "/"
        ? // 如果是 /，在前面添加 basename
          basename + (endsWithSlash ? "/" : "")
        : // 合并 path
          joinPaths([basename, pathname]);
  }

  // 把 To 对象转换为 string
  return navigator.createHref({ pathname: joinedPathname, search, hash });
}

/**
 * Returns true if this component is a descendant of a <Router>.
 * 判断当前 Router 是否在另一个 Router 中
 * @see https://reactrouter.com/docs/en/v6/api#useinroutercontext
 */
export function useInRouterContext(): boolean {
  return React.useContext(LocationContext) != null;
}

/**
 * Returns the current location object, which represents the current URL in web
 * browsers.
 * 拿到 LocationContext 中的 location
 * Note: If you're using this it may mean you're doing some of your own
 * "routing" in your app, and we'd like to know what your use case is. We may
 * be able to provide something higher-level to better suit your needs.
 *
 * @see https://reactrouter.com/docs/en/v6/api#uselocation
 */
export function useLocation(): Location {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useLocation() may be used only in the context of a <Router> component.`
  );

  return React.useContext(LocationContext).location;
}

/**
 * Returns the current navigation action which describes how the router came to
 * the current location, either by a pop, push, or replace on the history stack.
 * 当前的 action type
 * @see https://reactrouter.com/docs/en/v6/api#usenavigationtype
 */
export function useNavigationType(): NavigationType {
  return React.useContext(LocationContext).navigationType;
}

/**
 * Returns true if the URL for the given "to" value matches the current URL.
 * This is useful for components that need to know "active" state, e.g.
 * <NavLink>.
 * 查询指定路由是否能匹配上当前的 pathname
 * @see https://reactrouter.com/docs/en/v6/api#usematch
 */
export function useMatch<ParamKey extends string = string>(
  pattern: PathPattern | string
): PathMatch<ParamKey> | null {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useMatch() may be used only in the context of a <Router> component.`
  );

  return matchPath(pattern, useLocation().pathname);
}

/**
 * The interface for the navigate() function returned from useNavigate().
 */
export interface NavigateFunction {
  (to: To, options?: NavigateOptions): void;
  (delta: number): void;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: any;
}

/**
 * Returns an imperative method for changing the location. Used by <Link>s, but
 * may also be used by other elements to change the location.
 * 跳转的 navigate 函数，代替了原来的 useHistory，返回的 navigate 对象可以传和文件夹相同的路径规则
 * @see https://reactrouter.com/docs/en/v6/api#usenavigate
 */
export function useNavigate(): NavigateFunction {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useNavigate() may be used only in the context of a <Router> component.`
  );

  let { basename, navigator } = React.useContext(NavigationContext);
  let { matches } = React.useContext(RouteContext);
  let { pathname: locationPathname } = useLocation();

  // 依次匹配到的子路由之前的路径（/* 之前）
  let routePathnamesJson = JSON.stringify(
    matches.map(match => match.pathnameBase)
  );

  // 是否已经初始化完毕（useEffect），这里是要让页面不要在一渲染的时候就跳转，应该在 useEffect 后才能跳转
  let activeRef = React.useRef(false);
  React.useEffect(() => {
    activeRef.current = true;
  });

  let navigate: NavigateFunction = React.useCallback(
    (to: To | number, options: { replace?: boolean; state?: any } = {}) => {
      warning(
        activeRef.current,
        `You should call navigate() in a React.useEffect(), not when ` +
          `your component is first rendered.`
      );

      if (!activeRef.current) return;

      if (typeof to === "number") {
        navigator.go(to);
        return;
      }

      // 实际路径的获取
      let path = resolveTo(
        to,
        JSON.parse(routePathnamesJson),
        locationPathname
      );

      // 有 basename，加上 basename
      if (basename !== "/") {
        path.pathname = joinPaths([basename, path.pathname]);
      }

      (!!options.replace ? navigator.replace : navigator.push)(
        path,
        options.state
      );
    },
    [basename, navigator, routePathnamesJson, locationPathname]
  );

  return navigate;
}

/**
 * Returns the element for the child route at this level of the route
 * hierarchy. Used internally by <Outlet> to render child routes.
 * 拿到当前的 outlet
 * @see https://reactrouter.com/docs/en/v6/api#useoutlet
 */
export function useOutlet(): React.ReactElement | null {
  return React.useContext(RouteContext).outlet;
}

/**
 * Returns an object of key/value pairs of the dynamic params from the current
 * URL that were matched by the route path.
 * 拿到当前匹配到的所有 params
 * @see https://reactrouter.com/docs/en/v6/api#useparams
 */
export function useParams<Key extends string = string>(): Readonly<
  Params<Key>
> {
  let { matches } = React.useContext(RouteContext);
  let routeMatch = matches[matches.length - 1];
  return routeMatch ? (routeMatch.params as any) : {};
}

/**
 * Resolves the pathname of the given `to` value against the current location.
 * 转换路径的钩子，将 to 格式化为 Path
 * @see https://reactrouter.com/docs/en/v6/api#useresolvedpath
 */
export function useResolvedPath(to: To): Path {
  let { matches } = React.useContext(RouteContext);
  let { pathname: locationPathname } = useLocation();

  // JSON.stringify 是为了不每次 map 时生成新的地址依赖
  let routePathnamesJson = JSON.stringify(
    matches.map(match => match.pathnameBase)
  );

  return React.useMemo(
    () => resolveTo(to, JSON.parse(routePathnamesJson), locationPathname),
    [to, routePathnamesJson, locationPathname]
  );
}

/**
 * Returns the element of the route that matched the current location, prepared
 * with the correct context to render the remainder of the route tree. Route
 * elements in the tree must render an <Outlet> to render their child route's
 * element.
 * 1.该 hooks 不是只调用一次，每次重新匹配到路由时就会重新调用渲染新的 element
 * 2.当多次调用 useRoutes 时需要解决内置内置的 route 上下文问题，继承外层的匹配结果
 * 3.内部通过计算所有的 routes 与当前的 location 关系，经过路径权重计算，得到 matches 数组，然后将 matches 数组重新渲染为嵌套结构的组件
 * @see https://reactrouter.com/docs/en/v6/api#useroutes
 */
export function useRoutes(
  routes: RouteObject[],
  locationArg?: Partial<Location> | string
): React.ReactElement | null {
  invariant(
    useInRouterContext(),
    // TODO: This error is probably because they somehow have 2 versions of the
    // router loaded. We can help them understand how to avoid that.
    `useRoutes() may be used only in the context of a <Router> component.`
  );

  // 当该 hooks 在一个已经调用了 useRoutes 的渲染对象中渲染时，matches 或有值，也就是 Routes 的嵌套
  let { matches: parentMatches } = React.useContext(RouteContext);
  // 最后 match 到的 route（深度最深），该 route 将作为父 route，我们后续的 routes 都是其子级
  let routeMatch = parentMatches[parentMatches.length - 1];
  // 下面是父级 route 的参数，我们会基于以下参数操作
  let parentParams = routeMatch ? routeMatch.params : {};
  let parentPathname = routeMatch ? routeMatch.pathname : "/";
  let parentPathnameBase = routeMatch ? routeMatch.pathnameBase : "/";
  let parentRoute = routeMatch && routeMatch.route;

  if (__DEV__) {
    // You won't get a warning about 2 different <Routes> under a <Route>
    // without a trailing *, but this is a best-effort warning anyway since we
    // cannot even give the warning unless they land at the parent route.
    //
    // Example:
    //
    // <Routes>
    //   {/* This route path MUST end with /* because otherwise
    //       it will never match /blog/post/123 */}
    //   <Route path="blog" element={<Blog />} />
    //   <Route path="blog/feed" element={<BlogFeed />} />
    // </Routes>
    //
    // function Blog() {
    //   return (
    //     <Routes>
    //       <Route path="post/:id" element={<Post />} />
    //     </Routes>
    //   );
    // }

    let parentPath = (parentRoute && parentRoute.path) || "";
    warningOnce(
      parentPathname,
      // 如果有父级的 route（在一个已有 RouteProvider 的环境中），path 必须以 * 结尾
      !parentRoute || parentPath.endsWith("*"),
      `You rendered descendant <Routes> (or called \`useRoutes()\`) at ` +
        `"${parentPathname}" (under <Route path="${parentPath}">) but the ` +
        `parent route path has no trailing "*". This means if you navigate ` +
        `deeper, the parent won't match anymore and therefore the child ` +
        `routes will never render.\n\n` +
        `Please change the parent <Route path="${parentPath}"> to <Route ` +
        `path="${parentPath}/*">.`
    );
  }

  let locationFromContext = useLocation();

  // 判断是否手动传入了 location，否则用默认上下文的 location
  let location;
  if (locationArg) {
    let parsedLocationArg =
      typeof locationArg === "string" ? parsePath(locationArg) : locationArg;
    // 如果传入了 location，判断是否与父级路由匹配（作为子路由存在）
    invariant(
      parentPathnameBase === "/" ||
        parsedLocationArg.pathname?.startsWith(parentPathnameBase),
      `When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, ` +
        `the location pathname must begin with the portion of the URL pathname that was ` +
        `matched by all parent routes. The current pathname base is "${parentPathnameBase}" ` +
        `but pathname "${parsedLocationArg.pathname}" was given in the \`location\` prop.`
    );

    location = parsedLocationArg;
  } else {
    location = locationFromContext;
  }

  let pathname = location.pathname || "/";
  // 剩余的 pathname，减掉父级的 pathname，才是本次 routes 要匹配的 pathname
  let remainingPathname =
    parentPathnameBase === "/"
      ? pathname
      : pathname.slice(parentPathnameBase.length) || "/";
  // 匹配当前路径，需要移除父 parentPathname 的相关路径
  let matches = matchRoutes(routes, { pathname: remainingPathname });

  if (__DEV__) {
    // 父 Routes 没有匹配到并且当前 Routes 没有匹配到 location
    warning(
      parentRoute || matches != null,
      `No routes matched location "${location.pathname}${location.search}${location.hash}" `
    );

    // 没有对应的 element
    warning(
      matches == null ||
        matches[matches.length - 1].route.element !== undefined,
      `Matched leaf route at location "${location.pathname}${location.search}${location.hash}" does not have an element. ` +
        `This means it will render an <Outlet /> with a null value by default resulting in an "empty" page.`
    );
  }

  // 返回的是 React.Element，渲染所有的 matches 对象
  return _renderMatches(
    // 没有 matches 会返回 null
    matches &&
      matches.map(match =>
        // 合并父 Route 的参数，子 Route 会有父 Route 的所有匹配属性
        Object.assign({}, match, {
          params: Object.assign({}, parentParams, match.params),
          pathname: joinPaths([parentPathnameBase, match.pathname]),
          pathnameBase:
            match.pathnameBase === "/"
              ? parentPathnameBase
              : joinPaths([parentPathnameBase, match.pathnameBase])
        })
      ),
    parentMatches
  );
}

///////////////////////////////////////////////////////////////////////////////
// UTILS
///////////////////////////////////////////////////////////////////////////////

/**
 * Creates a route config from a React "children" object, which is usually
 * either a `<Route>` element or an array of them. Used internally by
 * `<Routes>` to create a route config from its children.
 * 将 Route 组件转换为 route 对象，提供给 useRoutes 使用
 * @see https://reactrouter.com/docs/en/v6/api#createroutesfromchildren
 */
export function createRoutesFromChildren(
  children: React.ReactNode
): RouteObject[] {
  let routes: RouteObject[] = [];

  React.Children.forEach(children, element => {
    if (!React.isValidElement(element)) {
      // Ignore non-elements. This allows people to more easily inline
      // conditionals in their route config.
      return;
    }

    // 空节点，忽略掉继续往下遍历
    if (element.type === React.Fragment) {
      // Transparently support React.Fragment and its children.
      routes.push.apply(
        routes,
        createRoutesFromChildren(element.props.children)
      );
      return;
    }

    // 不要传入其它组件，只能传 Route
    invariant(
      element.type === Route,
      `[${
        typeof element.type === "string" ? element.type : element.type.name
      }] is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`
    );

    let route: RouteObject = {
      caseSensitive: element.props.caseSensitive,
      element: element.props.element,
      index: element.props.index,
      path: element.props.path
    };

    // 递归
    if (element.props.children) {
      route.children = createRoutesFromChildren(element.props.children);
    }

    routes.push(route);
  });

  return routes;
}

/**
 * The parameters that were parsed from the URL path.
 */
export type Params<Key extends string = string> = {
  readonly [key in Key]: string | undefined;
};

/**
 * A route object represents a logical route, with (optionally) its child
 * routes organized in a tree-like structure.
 */
export interface RouteObject {
  caseSensitive?: boolean;
  children?: RouteObject[];
  element?: React.ReactNode;
  index?: boolean;
  path?: string;
}

/**
 * Returns a path with params interpolated.
 * 把 params 放入对应的 path 中，比如 /:id/* 与 {id:'foo','*':'bar'} => /foo/bar
 * @see https://reactrouter.com/docs/en/v6/api#generatepath
 */
export function generatePath(path: string, params: Params = {}): string {
  return path
    .replace(/:(\w+)/g, (_, key) => {
      invariant(params[key] != null, `Missing ":${key}" param`);
      return params[key]!;
    })
    .replace(/\/*\*$/, _ =>
      params["*"] == null ? "" : params["*"].replace(/^\/*/, "/")
    );
}

/**
 * A RouteMatch contains info about how a route matched a URL.
 */
export interface RouteMatch<ParamKey extends string = string> {
  /**
   * The names and values of dynamic parameters in the URL.
   */
  params: Params<ParamKey>;
  /**
   * 匹配到的路径 url
   * The portion of the URL pathname that was matched.
   */
  pathname: string;
  /**
   * 子路由匹配之前的路径 url，这里可以把它看做是只要以 /* 结尾路径中 /* 之前的部分
   * The portion of the URL pathname that was matched before child routes.
   */
  pathnameBase: string;
  /**
   * The route object that was used to match.
   */
  route: RouteObject;
}

/**
 * Matches the given routes to a location and returns the match data.
 * 通过 routes 与 location 得到 matches 数组
 * @see https://reactrouter.com/docs/en/v6/api#matchroutes
 */
export function matchRoutes(
  // 用户传入的 routes 对象
  routes: RouteObject[],
  // 当前匹配到的 location
  locationArg: Partial<Location> | string,
  basename = "/"
): RouteMatch[] | null {
  let location =
    typeof locationArg === "string" ? parsePath(locationArg) : locationArg;

  // 纯粹的 pathname
  let pathname = stripBasename(location.pathname || "/", basename);

  if (pathname == null) {
    return null;
  }

  // 扁平化 routes
  let branches = flattenRoutes(routes);
  // 根据匹配到的权重排序
  rankRouteBranches(branches);

  let matches = null;
  // 这里就是权重比较完成后的解析顺序，权重高的在前面，先进行匹配，然后是权重低的匹配
  // branches 中有一个匹配到了就终止循环，或者全都没有匹配到
  for (let i = 0; matches == null && i < branches.length; ++i) {
    // 遍历扁平化的 routes，查看每个 branch 的路径匹配规则
    matches = matchRouteBranch(branches[i], routes, pathname);
  }

  return matches;
}

interface RouteMeta {
  /**
   * 相对路径
   */
  relativePath: string;
  caseSensitive: boolean;
  /**
   * 用户在 routes 数组中的索引位置（相对其兄弟 route 而言）
   */
  childrenIndex: number;
}

interface RouteBranch {
  /**
   * 完整的 path
   */
  path: string;
  /**
   * 权重，用于排序
   */
  score: number;
  /**
   * 路径 meta，依次为从父级到子级的路径规则，最后一个是路由自己
   */
  routesMeta: RouteMeta[];
}

/**
 * 扁平化路由，会将所有路由扁平为一个数组，用于比较权重
 * @param routes 第一次调用只需要传入该值，用于转换的 routes 数组
 * @param branches
 * @param parentsMeta
 * @param parentPath
 * @returns
 */
function flattenRoutes(
  routes: RouteObject[],
  branches: RouteBranch[] = [],
  parentsMeta: RouteMeta[] = [],
  parentPath = ""
): RouteBranch[] {
  routes.forEach((route, index) => {
    // 当前 branch 管理的 route meta
    let meta: RouteMeta = {
      // 只保存相对路径，下面会进行处理
      relativePath: route.path || "",
      caseSensitive: route.caseSensitive === true,
      // index 是用户给出的 routes 顺序，会一定程度影响 branch 的排序（当为同一层级 route 时）
      childrenIndex: index
    };

    // 如果 route 以 / 开头，那么它应该完全包含父 route 的 path
    if (meta.relativePath.startsWith("/")) {
      invariant(
        meta.relativePath.startsWith(parentPath),
        `Absolute route path "${meta.relativePath}" nested under path ` +
          `"${parentPath}" is not valid. An absolute child route path ` +
          `must start with the combined path of all its parent routes.`
      );

      // 只要相对路径
      meta.relativePath = meta.relativePath.slice(parentPath.length);
    }

    // 完整的 path
    let path = joinPaths([parentPath, meta.relativePath]);
    // 将自己的 meta 进行推入
    let routesMeta = parentsMeta.concat(meta);

    // Add the children before adding this route to the array so we traverse the
    // route tree depth-first and child routes appear before their parents in
    // the "flattened" version.
    // 递归
    if (route.children && route.children.length > 0) {
      // 如果是 index route，报错，因为 index route 不能有 children
      invariant(
        route.index !== true,
        `Index routes must not have child routes. Please remove ` +
          `all child routes from route path "${path}".`
      );

      flattenRoutes(route.children, branches, routesMeta, path);
    }

    // Routes without a path shouldn't ever match by themselves unless they are
    // index routes, so don't add them to the list of possible branches.
    // 没有路径的路由不参与 match，除非它是 index route
    if (route.path == null && !route.index) {
      return;
    }

    // routesMeta，包含父 route 到自己的全部 meta 信息
    branches.push({ path, score: computeScore(path, route.index), routesMeta });
  });

  return branches;
}

/**
 * 排序，比较权重值
 * @param branches
 */
function rankRouteBranches(branches: RouteBranch[]): void {
  branches.sort((a, b) =>
    a.score !== b.score
      ? b.score - a.score // Higher score first
      : // 如果 a.score === b.score
        compareIndexes(
          // childrenIndex 是按照 routes 中 route 传入的顺序传值的
          a.routesMeta.map(meta => meta.childrenIndex),
          b.routesMeta.map(meta => meta.childrenIndex)
        )
  );
}

/**
 * 单位权重
 */
const paramRe = /^:\w+$/;
const dynamicSegmentValue = 3;
const indexRouteValue = 2;
const emptySegmentValue = 1;
const staticSegmentValue = 10;
const splatPenalty = -2;
const isSplat = (s: string) => s === "*";

/**
 * 计算路由权值，根据权值大小匹配路由
 * 静态值 > params 动态参数
 * @param path
 * @param index
 * @returns
 */
function computeScore(path: string, index: boolean | undefined): number {
  let segments = path.split("/");
  // 初始化权重
  let initialScore = segments.length;
  // 有一个 * 权重减 2
  if (segments.some(isSplat)) {
    initialScore += splatPenalty;
  }

  // 用户传了 index，index 是布尔值，代表 IndexRouter，权重 +2
  if (index) {
    initialScore += indexRouteValue;
  }

  // 在过滤出非 * 的部分
  return segments
    .filter(s => !isSplat(s))
    .reduce(
      (score, segment) =>
        score +
        // 如果有动态参数
        (paramRe.test(segment)
          ? // 动态参数权重 3
            dynamicSegmentValue
          : segment === ""
          ? // 空值权重为 1，也就是两个 // 连着中间会多 1 的权重
            emptySegmentValue
          : // 静态值权重最高为 10
            staticSegmentValue),
      initialScore
    );
}

/**
 * 比较子 route 的 index，判断是否为兄弟 route，如果不是则返回 0，比较没有意义，不做任何操作
 * @param a
 * @param b
 * @returns
 */
function compareIndexes(a: number[], b: number[]): number {
  // 是否为兄弟 route
  let siblings =
    // 这里是比较除了最后一个 route 的 path，需要全部一致才是兄弟 route
    a.length === b.length && a.slice(0, -1).every((n, i) => n === b[i]);

  return siblings
    ? // If two routes are siblings, we should try to match the earlier sibling
      // first. This allows people to have fine-grained control over the matching
      // behavior by simply putting routes with identical paths in the order they
      // want them tried.
      // 如果是兄弟节点，判断 route 的 index（可手动传入控制），否则简单按照索引顺序比较
      a[a.length - 1] - b[b.length - 1]
    : // Otherwise, it doesn't really make sense to rank non-siblings by index,
      // so they sort equally.
      // 只比较兄弟节点，如果不是兄弟节点，则权重相同
      0;
}

/**
 * 通过 branch 和当前的 pathname 得到真正的 matches 数组
 * @param branch
 * @param routesArg
 * @param pathname
 * @returns
 */
function matchRouteBranch<ParamKey extends string = string>(
  branch: RouteBranch,
  // 这里后续貌似会更改，将这个参数放到 branch 的 routesMeta 中
  // TODO: attach original route object inside routesMeta so we don't need this arg
  routesArg: RouteObject[],
  // 这里的 pathname 已经处理过 base 了，所以当做是普通的 pathname
  pathname: string
): RouteMatch<ParamKey>[] | null {
  let routes = routesArg;
  let { routesMeta } = branch;

  // 初始化匹配到的值
  let matchedParams = {};
  let matchedPathname = "/";
  let matches: RouteMatch[] = [];
  // 遍历 routesMeta 数组，最后一项是自己的 route，前面是 parentRoute
  for (let i = 0; i < routesMeta.length; ++i) {
    let meta = routesMeta[i];
    // 是否为最后一个 route
    let end = i === routesMeta.length - 1;
    // 剩余的路径名
    let remainingPathname =
      matchedPathname === "/"
        ? pathname
        : pathname.slice(matchedPathname.length) || "/";
    // 使用的相对路径规则匹配剩余的值
    let match = matchPath(
      // 所以默认在匹配时只有最后一个 route 的 end 才会是 true，其余都是 false
      { path: meta.relativePath, caseSensitive: meta.caseSensitive, end },
      remainingPathname
    );

    // 没匹配上
    if (!match) return null;

    // 匹配上了合并 params，注意这里是改变的 matchedParams，所以所有 route 的 params 都是同一个
    Object.assign(matchedParams, match.params);

    // childrenIndex 和 route 的 index 一定是一一对应的，只有 branch 数量可能对应不上
    let route = routes[meta.childrenIndex];

    // 匹配上了就把路径再补全
    matches.push({
      params: matchedParams,
      pathname: joinPaths([matchedPathname, match.pathname]),
      pathnameBase: joinPaths([matchedPathname, match.pathnameBase]),
      route
    });

    // 不是第一级的路由了，更改 matchedPathname，用作后续子 route 的循环
    if (match.pathnameBase !== "/") {
      matchedPathname = joinPaths([matchedPathname, match.pathnameBase]);
    }

    // routes 更新为所有子 route
    routes = route.children!;
  }

  return matches;
}

/**
 * Renders the result of `matchRoutes()` into a React element.
 */
export function renderMatches(
  matches: RouteMatch[] | null
): React.ReactElement | null {
  return _renderMatches(matches);
}

/**
 * 渲染 RouteProvider（包括多个嵌套的 Provider）
 */
function _renderMatches(
  matches: RouteMatch[] | null,
  // 如果在已有 match 的 route 内部调用，会合并父 context 的 match
  parentMatches: RouteMatch[] = []
): React.ReactElement | null {
  if (matches == null) return null;

  // 生成 outlet 组件，主要这里是从后往前 reduce，所有最前面的是最外层
  /**
   *  可以看到 outlet 是通过不断递归生成的组件，最外层的 outlet 递归层数最多，包含有所有的内层组件，
   *  所以我们在外层使用的 <Outlet /> 是包含有所有子组件的聚合组件
   * */
  return matches.reduceRight((outlet, match, index) => {
    return (
      <RouteContext.Provider
        // 如果有 element 就渲染 element，如果没有填写 element，则默认是 <Outlet />，继续渲染内嵌的 <Route />
        children={
          match.route.element !== undefined ? match.route.element : <Outlet />
        }
        // 代表当前 RouteContext 匹配到的值，matches 并不是全局状态一致的，会根据层级不同展示不同的值，最后一个层级是完全的 matches
        value={{
          outlet,
          matches: parentMatches.concat(matches.slice(0, index + 1))
        }}
      />
    );
  }, null as React.ReactElement | null);
}

/**
 * A PathPattern is used to match on some portion of a URL pathname.
 */
export interface PathPattern {
  /**
   * A string to match against a URL pathname. May contain `:id`-style segments
   * to indicate placeholders for dynamic parameters. May also end with `/*` to
   * indicate matching the rest of the URL pathname.
   */
  path: string;
  /**
   * Should be `true` if the static portions of the `path` should be matched in
   * the same case.
   */
  caseSensitive?: boolean;
  /**
   * Should be `true` if this pattern should match the entire URL pathname.
   */
  end?: boolean;
}

/**
 * A PathMatch contains info about how a PathPattern matched on a URL pathname.
 */
export interface PathMatch<ParamKey extends string = string> {
  /**
   * The names and values of dynamic parameters in the URL.
   */
  params: Params<ParamKey>;
  /**
   * The portion of the URL pathname that was matched.
   */
  pathname: string;
  /**
   * The portion of the URL pathname that was matched before child routes.
   */
  pathnameBase: string;
  /**
   * The pattern that was used to match.
   */
  pattern: PathPattern;
}

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Performs pattern matching on a URL pathname and returns information about
 * the match.
 * 判断 pathname 是否匹配传入的 pattern，如果不匹配返回 null，如果匹配就返回进过解析后的值
 * @see https://reactrouter.com/docs/en/v6/api#matchpath
 */
export function matchPath<ParamKey extends string = string>(
  pattern: PathPattern | string,
  pathname: string
): PathMatch<ParamKey> | null {
  if (typeof pattern === "string") {
    pattern = { path: pattern, caseSensitive: false, end: true };
  }

  // paramNames 为动态参数名，比如 *、id
  let [matcher, paramNames] = compilePath(
    pattern.path,
    pattern.caseSensitive,
    pattern.end
  );

  let match = pathname.match(matcher);
  if (!match) return null;

  // 匹配到的 pathname
  let matchedPathname = match[0];
  // $1 代表第 n 个括号内的内容，这里其实就是去除最后一层路径后面的所有 /
  let pathnameBase = matchedPathname.replace(/(.)\/+$/, "$1");
  // 匹配到的 match 数组，从数组的第二个元素开始就是 () 中匹配到的内容，比如 /about/*，传入 /about/1，就会匹配到 1
  let captureGroups = match.slice(1);
  // 匹配到所有的动态参数，包括 * 和 :id 等
  let params: Params = paramNames.reduce<Mutable<Params>>(
    (memo, paramName, index) => {
      // We need to compute the pathnameBase here using the raw splat value
      // instead of using params["*"] later because it will be decoded then
      // 这里是使用原始字符串计算，因为后续在 params 中已经解码了，pathnameBase 获取会有问题
      if (paramName === "*") {
        // 对应匹配到的值
        let splatValue = captureGroups[index] || "";
        /**
         * 这个匹配在这里其实就是把例如 /home/* 这样的路径变为 /home。
         * 比如在 Route 中设置为 /home/*，实际路径匹配为 /home/2，这里 matchedPathname 就为 /home/2，而 pathnameBase 为 /home
         */
        pathnameBase = matchedPathname
          .slice(0, matchedPathname.length - splatValue.length)
          // 去除末尾的 /
          .replace(/(.)\/+$/, "$1");
      }

      // 解码
      memo[paramName] = safelyDecodeURIComponent(
        captureGroups[index] || "",
        paramName
      );
      return memo;
    },
    {}
  );

  return {
    params,
    pathname: matchedPathname,
    pathnameBase,
    pattern
  };
}

/**
 * 解析 path，会将 path => 对应的 RegExp，同时解析出 path 的所有 params
 * 可以再这里面看到没有处理 /about/*\//1 这样的路径，所以这样的路径不会对 * 做处理，需要直接访问 /about/*\//1
 * @param path
 * @param caseSensitive 是否兼容大小写不一致
 * @param end 是否匹配末尾的 /
 * @returns
 */
function compilePath(
  path: string,
  caseSensitive = false,
  end = true
): [RegExp, string[]] {
  // path 不能是 /home* 这样的，否则打印警告
  warning(
    path === "*" || !path.endsWith("*") || path.endsWith("/*"),
    `Route path "${path}" will be treated as if it were ` +
      `"${path.replace(/\*$/, "/*")}" because the \`*\` character must ` +
      `always follow a \`/\` in the pattern. To get rid of this warning, ` +
      `please change the route path to "${path.replace(/\*$/, "/*")}".`
  );

  let paramNames: string[] = [];
  let regexpSource =
    "^" +
    path
      // 先忽略尾部的 / 和 /*
      .replace(/\/*\*?$/, "") // Ignore trailing / and /*, we'll handle it below
      // 确保开头有一个 /
      .replace(/^\/*/, "/") // Make sure it has a leading /
      // 转义特殊与正则表达式有关的字符
      .replace(/[\\.*+^$?{}|()[\]]/g, "\\$&") // Escape special regex chars
      // 转义以:开头的路径块，也就是 params，比如 :id
      .replace(/:(\w+)/g, (_: string, paramName: string) => {
        paramNames.push(paramName);
        return "([^\\/]+)";
      });

  // 在这里处理尾部的 /* 和 *
  if (path.endsWith("*")) {
    // 尾部有 * 才代表 params 中有 *
    paramNames.push("*");
    regexpSource +=
      path === "*" || path === "/*"
        ? // 如果为 * 或 /* 则处理任意值
          "(.*)$" // Already matched the initial /, just match the rest
        : // 这里 (?:x) 是非捕获匹配，捕获通过 match 将 () 中的值返回，也就不会放入 params 中
          // 下面是匹配 /xxx 和 /*（/出现 0 次或多次），下面两者有相互重叠的地方，后续官方应该会改吧，感觉怪怪的
          "(?:\\/(.+)|\\/*)$"; // Don't include the / in params["*"]
  } else {
    // 如果最后没有以 * 结尾，则忽略末尾的 /，否则我们应该至少匹配到一个单次边界
    regexpSource += end
      ? "\\/*$" // When matching to the end, ignore trailing slashes
      : // Otherwise, at least match a word boundary. This restricts parent
        // routes to matching only their own words and nothing more, e.g. parent
        // route "/home" should not match "/home2".
        // 限制了父 routes 只能匹配到自己的单词
        // 匹配到单词边界
        "(?:\\b|$)";
  }

  // path => pattern
  let matcher = new RegExp(regexpSource, caseSensitive ? undefined : "i");

  return [matcher, paramNames];
}

/**
 * 解码 url，做了层封装
 * @param value
 * @param paramName
 * @returns
 */
function safelyDecodeURIComponent(value: string, paramName: string) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    warning(
      false,
      `The value for the URL param "${paramName}" will not be decoded because` +
        ` the string "${value}" is a malformed URL segment. This is probably` +
        ` due to a bad percent encoding (${error}).`
    );

    return value;
  }
}

/**
 * Returns a resolved path object relative to the given pathname.
 * 把传入的路径解析为 Path 对象，并会在这里处理相对路径之间的关系
 * @see https://reactrouter.com/docs/en/v6/api#resolvepath
 */
export function resolvePath(to: To, fromPathname = "/"): Path {
  let {
    pathname: toPathname,
    search = "",
    hash = ""
  } = typeof to === "string" ? parsePath(to) : to;

  let pathname = toPathname
    ? toPathname.startsWith("/")
      ? toPathname
      : // 处理相对路径
        resolvePathname(toPathname, fromPathname)
    : fromPathname;

  return {
    pathname,
    search: normalizeSearch(search),
    hash: normalizeHash(hash)
  };
}

/**
 *
 * 处理相对路径
 * @param relativePath 相对路径
 * @param fromPathname 上下文路径
 * @returns
 */
function resolvePathname(relativePath: string, fromPathname: string): string {
  // 去除末尾的 /，然后用 / 分割。如果传入的 fromPathname 为 / 则返回 [""]，注意 [""] 是默认值。最小就是 [""]
  let segments = fromPathname.replace(/\/+$/, "").split("/");
  // 这时的 relativePath 并不是以 / 开头的
  let relativeSegments = relativePath.split("/");

  // 这段代码就是解析路径，将 .. 和 . 这些与父级目录想比较，然后解析成绝对路径
  relativeSegments.forEach(segment => {
    if (segment === "..") {
      // Keep the root "" segment so the pathname starts at /
      // 注意这里是大于 1。证明这里会保证相对路径最后转换为以 / 开头的绝对路径
      if (segments.length > 1) segments.pop();
    } else if (segment !== ".") {
      // 如果不是 .，添加新的路径，. 代表当前路径，没有作用
      segments.push(segment);
    }
  });

  // 聚合上面的路径数组
  return segments.length > 1 ? segments.join("/") : "/";
}

/**
 * 将 to 解析为实际要跳转的路径，因为 to 可以是相对路径等，不是完全传入的 /xxx
 * @param toArg 要跳转的路径
 * @param routePathnames 当前的所有父 Route 匹配到的路径
 * @param locationPathname 当前的 location 中的 pathname
 * @returns
 */
function resolveTo(
  toArg: To,
  routePathnames: string[],
  locationPathname: string
): Path {
  let to = typeof toArg === "string" ? parsePath(toArg) : toArg;
  let toPathname = toArg === "" || to.pathname === "" ? "/" : to.pathname;

  // If a pathname is explicitly provided in `to`, it should be relative to the
  // route context. This is explained in `Note on `<Link to>` values` in our
  // migration guide from v5 as a means of disambiguation between `to` values
  // that begin with `/` and those that do not. However, this is problematic for
  // `to` values that do not provide a pathname. `to` can simply be a search or
  // hash string, in which case we should assume that the navigation is relative
  // to the current location's pathname and *not* the route pathname.
  let from: string;
  if (toPathname == null) {
    from = locationPathname;
  } else {
    let routePathnameIndex = routePathnames.length - 1;

    if (toPathname.startsWith("..")) {
      let toSegments = toPathname.split("/");

      // Each leading .. segment means "go up one route" instead of "go up one
      // URL segment".  This is a key difference from how <a href> works and a
      // major reason we call this a "to" value instead of a "href".
      while (toSegments[0] === "..") {
        toSegments.shift();
        routePathnameIndex -= 1;
      }

      to.pathname = toSegments.join("/");
    }

    // If there are more ".." segments than parent routes, resolve relative to
    // the root / URL.
    from = routePathnameIndex >= 0 ? routePathnames[routePathnameIndex] : "/";
  }

  let path = resolvePath(to, from);

  // Ensure the pathname has a trailing slash if the original to value had one.
  if (
    toPathname &&
    toPathname !== "/" &&
    toPathname.endsWith("/") &&
    !path.pathname.endsWith("/")
  ) {
    path.pathname += "/";
  }

  return path;
}

/**
 * to 的 pathname
 * @param to
 * @returns
 */
function getToPathname(to: To): string | undefined {
  // Empty strings should be treated the same as / paths
  return to === "" || (to as Path).pathname === ""
    ? "/"
    : typeof to === "string"
    ? parsePath(to).pathname
    : to.pathname;
}

/**
 *
 * 抽离 basename，获取纯粹的 path，如果没有匹配到则返回 null
 * @param pathname
 * @param basename
 * @returns
 */
function stripBasename(pathname: string, basename: string): string | null {
  if (basename === "/") return pathname;

  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return null;
  }

  // 如果 basename 不是 /，证明有值，比如 /foo/，这里要验证最后一个字符是否为 /，不是 / 则返回 null
  let nextChar = pathname.charAt(basename.length);
  if (nextChar && nextChar !== "/") {
    // pathname does not start with basename/
    return null;
  }

  // 返回去除掉 basename 的 path
  return pathname.slice(basename.length) || "/";
}

/**
 *
 * 将多个 path 合并为一个
 * @param paths path 数组
 * @returns
 */
const joinPaths = (paths: string[]): string =>
  paths.join("/").replace(/\/\/+/g, "/");

/**
 * 格式化 pathname
 * @param pathname
 * @returns
 */
const normalizePathname = (pathname: string): string =>
  pathname.replace(/\/+$/, "").replace(/^\/*/, "/");

/**
 * 格式化 search 字符串
 * @param search
 * @returns
 */
const normalizeSearch = (search: string): string =>
  !search || search === "?"
    ? ""
    : search.startsWith("?")
    ? search
    : "?" + search;

/**
 * 格式化 hash 字符串
 * @param hash
 * @returns
 */
const normalizeHash = (hash: string): string =>
  !hash || hash === "#" ? "" : hash.startsWith("#") ? hash : "#" + hash;

///////////////////////////////////////////////////////////////////////////////
// DANGER! PLEASE READ ME!
// We provide these exports as an escape hatch in the event that you need any
// routing data that we don't provide an explicit API for. With that said, we
// want to cover your use case if we can, so if you feel the need to use these
// we want to hear from you. Let us know what you're building and we'll do our
// best to make sure we can support you!
//
// We consider these exports an implementation detail and do not guarantee
// against any breaking changes, regardless of the semver release. Use with
// extreme caution and only if you understand the consequences. Godspeed.
///////////////////////////////////////////////////////////////////////////////

/** @internal */
export {
  NavigationContext as UNSAFE_NavigationContext,
  LocationContext as UNSAFE_LocationContext,
  RouteContext as UNSAFE_RouteContext
};
