import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './Home'
import Forecast from './Forecast'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/:zipCode',
    element: <Forecast />,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
