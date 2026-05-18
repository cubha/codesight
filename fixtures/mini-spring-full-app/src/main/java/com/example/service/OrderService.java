package com.example.service;

import com.example.repository.OrderRepository;
import com.example.repository.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public OrderService(OrderRepository orderRepository, UserRepository userRepository) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    public String findAll() { return orderRepository.findAll(); }
    public String findById(Long id) { return orderRepository.findById(id); }
    public String place(String body) {
        userRepository.touchAuthor(body);
        return orderRepository.save(body);
    }
    public String cancel(Long id) { return orderRepository.cancel(id); }
}
