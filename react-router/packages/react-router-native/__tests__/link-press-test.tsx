import * as React from "react";
import { Text, TouchableHighlight, View } from "react-native";
import { Link, NativeRouter, Routes, Route } from "react-router-native";
import * as TestRenderer from "react-test-renderer";

import { press } from "./utils";

describe("A <Link> press", () => {
  it("navigates to the new view", () => {
    function Home() {
      return (
        <View>
          <Text>Home</Text>
          <Link to="../about">
            <Text>About</Text>
          </Link>
        </View>
      );
    }

    function About() {
      return (
        <View>
          <Text>About</Text>
        </View>
      );
    }

    let renderer: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <NativeRouter initialEntries={["/home"]}>
          <Routes>
            <Route path="home" element={<Home />} />
            <Route path="about" element={<About />} />
          </Routes>
        </NativeRouter>
      );
    });

    expect(renderer.toJSON()).toMatchSnapshot();

    let touchable = renderer.root.findByType(TouchableHighlight);

    TestRenderer.act(() => {
      press(touchable);
    });

    expect(renderer.toJSON()).toMatchSnapshot();
  });

  it("calls the custom onPress handler", () => {
    let spy = jest.fn();

    function Home() {
      return (
        <View>
          <Text>Home</Text>
          <Link to="../about" onPress={spy}>
            <Text>About</Text>
          </Link>
        </View>
      );
    }

    function About() {
      return (
        <View>
          <Text>About</Text>
        </View>
      );
    }

    let renderer: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <NativeRouter initialEntries={["/home"]}>
          <Routes>
            <Route path="home" element={<Home />} />
            <Route path="about" element={<About />} />
          </Routes>
        </NativeRouter>
      );
    });

    expect(renderer.toJSON()).toMatchSnapshot();

    let touchable = renderer.root.findByType(TouchableHighlight);

    let pressEvent;
    TestRenderer.act(() => {
      pressEvent = press(touchable);
    });

    expect(spy).toHaveBeenCalledWith(pressEvent);
  });

  describe("when event.preventDefault() is used in the onPress handler", () => {
    it("does not navigate to the new view", () => {
      function Home() {
        return (
          <View>
            <Text>Home</Text>
            <Link
              to="../about"
              onPress={event => {
                event.preventDefault();
              }}
            >
              <Text>About</Text>
            </Link>
          </View>
        );
      }

      function About() {
        return (
          <View>
            <Text>About</Text>
          </View>
        );
      }

      let renderer: TestRenderer.ReactTestRenderer;
      TestRenderer.act(() => {
        renderer = TestRenderer.create(
          <NativeRouter initialEntries={["/home"]}>
            <Routes>
              <Route path="home" element={<Home />} />
              <Route path="about" element={<About />} />
            </Routes>
          </NativeRouter>
        );
      });

      expect(renderer.toJSON()).toMatchSnapshot();

      let touchable = renderer.root.findByType(TouchableHighlight);

      TestRenderer.act(() => {
        press(touchable);
      });

      expect(renderer.toJSON()).toMatchSnapshot();
    });
  });
});
