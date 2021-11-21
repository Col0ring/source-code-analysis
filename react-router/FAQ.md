# Frequently Asked Questions

This is a list of support questions that frequently show up in GitHub issues. This list is intended to minimize the frequency of this happening. The issues section is intended for bug reports, not developer support. Support questions should be asked at StackOverflow or in the Reactiflux chat.

If there is a support question that you frequently see being asked, please open a PR to add it to this list.

- [Why doesn't my application render after refreshing?](#why-doesnt-my-application-render-after-refreshing)
- [Why doesn't my application work when loading nested routes?](#why-doesnt-my-application-work-when-loading-nested-routes)
- [How do I access the `history` object outside of components?](#how-do-i-access-the-history-object-outside-of-components)
- [How do I pass props to the component rendered by a `<Route>`?](#how-do-i-pass-props-to-the-component-rendered-by-a-route)

### Why doesn't my application render after refreshing?

If your application is hosted on a static file server, you need to use a `<HashRouter>` instead of a `<BrowserRouter>`.

```js
import { HashRouter } from "react-router-dom";

ReactDOM.render(
  <HashRouter>
    <App />
  </HashRouter>,
  holder
);
```

When you load the root page of a website hosted on a static file server (e.g., `http://www.example.com`), a `<BrowserHistory>` might appear to work. However, this is only because when the browser makes the request for the root page, the server responds with the root `index.html` file.

If you load the application through the root page, in-app navigation will work because requests are not actually made to the server. This means that if you load `http://www.example.com` and click a link to `http://www.example.com/other-page/`, your application will match and render the `/other-page/` route.

However, you will end up with a blank screen if you were to refresh a non-root page (or just attempt to navigate directly to it). Opening up your browser's developer tools, you will see an error message in the console informing you that the page could not be loaded. This is because static file servers rely on the requested file actually existing.

```bash
# a request for http://www.example.com/other-page/ expects this to exist
.
|-- index.html
+-- other-page
    +-- index.html
```

This is not an issue when your server can respond to dynamic requests. In that situation, you can instruct the server to catch all requests and serve up the same `index.html` file.

```js
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "index.html"));
});
```

When you use a static server, your application should have just one `index.html` file.

```bash
.
|-- index.html # this is the only html file
+-- static
    |-- js
    |   +-- bundle.js
    +-- css
        +-- index.css
```

Then, you can use a hash history (created by a `<HashRouter>`) to encode the location in the URL's `hash` fragment. The pathname of the real url will always point to the same file on the server (e.g., both `http://www.example.com/#/` and `http://www.example.com/#/other-page` will load the root `index.html` file). This results in URLs that are not as pretty as the ones created when you use a `<BrowserRouter>`, but it is a necessary limitation of working with a static file server.

### Why doesn't my application work when loading nested routes?

If the `src` of the `<script>` tag that is used to load your application has a relative path, you will run into issues when loading your application from nested locations (e.g., `/parent` works, but `/parent/child` does not). All that you have to do to fix this is to ensure that the `src` path is absolute.

```html
<!-- good -->
<script src="/static/js/bundle.js"></script>
<!-- bad -->
<script src="static/js/bundle.js"></script>
<script src="./static/js/bundle.js"></script>
```

### How do I access the `history` object outside of components?

When you use the `<BrowserRouter>`, `<HashRouter>`, `<MemoryRouter>`, and `<NativeRouter>`, a `history` object will be created for you. This is convenient, and the `history` object is readily accessible from within your React components, but it can be a pain to use it outside of them. If you need to access a `history` object outside of your components, you will need to create your own `history` object (in its own module) and import it throughout your project.

If you do this, make sure that you use the generic `<Router>` component and not one of the specialty routers.

```js
// history.js
import { createBrowserHistory } from "history";
export default createBrowserHistory();
```

```js
// index.js
import { Router } from "react-router-dom";
import history from "./history";

ReactDOM.render(
  <Router history={history}>
    <App />
  </Router>,
  document.getElementById("root")
);
```

```js
// nav.js
import history from "./history";

export default function nav(loc) {
  history.push(loc);
}
```

You can see a demonstration of how this works in this [CodeSandbox demo](https://codesandbox.io/s/owQ8Wrk3).

### How do I pass props to the component rendered by a `<Route>`?

If you need to pass props to the component rendered by a `<Route>`, you should use the `<Route>`'s `render` prop. The `render` prop can take an inline function as its value, which means that you can pass variables from the local scope to the component that the `<Route>` renders.

**Note:** The `render` function receives a `props` argument, which you should pass on to the element that your `render` function returned. If you do not do this, the component that you are rendering will not have access to the router variables (`match`, `location`, and `history`).

```js
const App = () => {
  const color = "red";
  return (
    <Route
      path="/somewhere"
      render={props => <MyComponent {...props} color={color} />}
    />
  );
};
```
