package com.example.service;

import com.example.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public Object findAll() {
        return userRepository.findAll();
    }

    public Object create(Object dto) {
        return userRepository.save(dto);
    }
}
