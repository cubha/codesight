package com.example.service;

import com.example.repository.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public String findAll() { return userRepository.findAll(); }
    public String findById(Long id) { return userRepository.findById(id); }
    public String create(String body) { return userRepository.save(body); }
    public String update(Long id, String body) { return userRepository.update(id, body); }
    public String delete(Long id) { return userRepository.delete(id); }
}
