from django.views import View

class UserListView(View):
    def get(self, request):
        return []

class UserDetailView(View):
    def get(self, request, pk):
        return {}

class PostListView(View):
    def get(self, request):
        return []

class PostDetailView(View):
    def get(self, request, slug):
        return {}
