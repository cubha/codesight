from fastapi import APIRouter

router = APIRouter()

@router.get('/posts')
def list_posts():
    return []

@router.get('/posts/{post_id}')
def get_post(post_id: int):
    return {}
