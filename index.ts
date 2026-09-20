// Must be the first import (react-native-gesture-handler's own setup requirement, also what
// React Navigation's own docs recommend) — ADR-HEARTH-104 introduced this as Hearth's first use
// of gesture-handler/React Navigation.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
