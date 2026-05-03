from fastapi import APIRouter

router = APIRouter()

@router.get('/users')
def list_users():
    return []

@router.get('/users/{user_id}')
def get_user(user_id: int):
    return {}

@router.post('/users')
def create_user():
    return {}
