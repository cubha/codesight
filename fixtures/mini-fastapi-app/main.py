from fastapi import FastAPI
from routers import users, posts

app = FastAPI()

app.include_router(users.router, prefix='/api')
app.include_router(posts.router, prefix='/api')

@app.get('/')
def read_root():
    return {'Hello': 'World'}

@app.get('/health')
def health_check():
    return {'status': 'ok'}
