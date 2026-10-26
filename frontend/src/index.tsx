import * as React from 'react';
import { Route, Switch } from 'wouter';

import FreeCellPage from './pages/FreeCell';
import KlondikePage from './pages/Klondike';
import MenuPage from './pages/Menu';
import SpiderPage from './pages/Spider';

export default function App() {
  return (
    <Switch>
      <Route component={MenuPage} path="/" />
      <Route component={KlondikePage} path="/klondike" />
      <Route component={SpiderPage} path="/spider/:suits" />
      <Route component={FreeCellPage} path="/freecell" />
    </Switch>
  );
}
