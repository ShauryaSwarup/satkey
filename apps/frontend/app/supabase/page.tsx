
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
    const cookieStore = await cookies()
    const supabase = await createClient(cookieStore)

    const { data: todos } = await supabase.from('todos').select()

    return (
        <ul>
            {todos?.map((todo) => (
                <li>{todo}</li>
            ))}
        </ul>
    )
}
