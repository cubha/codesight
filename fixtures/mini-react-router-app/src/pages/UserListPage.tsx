import { Outlet } from 'react-router-dom'
import UserCard from '../components/UserCard'
export default function UserListPage() { return <div><h1>Users</h1><UserCard name="Alice" /><Outlet /></div> }
