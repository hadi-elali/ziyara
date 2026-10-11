const { AndroidConfig, withAndroidStyles } = require("expo/config-plugins");

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withCompactAndroidTabs = (config) =>
  withAndroidStyles(config, (modConfig) => {
    // NativeTabs uses its own Material 3 theme, so override the widget style
    // rather than AppTheme. A minimum height preserves room for larger text;
    // Android still adds the system navigation inset below the tab content.
    const parent = {
      name: "Widget.Material3.BottomNavigationView",
      parent: "Base.Widget.Material3.BottomNavigationView",
    };

    for (const [name, value] of Object.entries({
      "android:minHeight": "60dp",
      itemPaddingTop: "4dp",
      itemPaddingBottom: "6dp",
    })) {
      modConfig.modResults = AndroidConfig.Styles.setStylesItem({
        xml: modConfig.modResults,
        parent,
        item: AndroidConfig.Resources.buildResourceItem({ name, value }),
      });
    }

    return modConfig;
  });

module.exports = withCompactAndroidTabs;
