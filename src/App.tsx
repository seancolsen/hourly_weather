import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './Home'
import Zip from './Zip'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/:zipCode',
    element: <Zip />,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
