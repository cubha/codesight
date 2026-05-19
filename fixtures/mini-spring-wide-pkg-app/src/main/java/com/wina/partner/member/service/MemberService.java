package com.wina.partner.member.service;

import com.wina.partner.member.repository.MemberRepository;
import org.springframework.stereotype.Service;

@Service
public class MemberService {
    private final MemberRepository repository;
    public MemberService(MemberRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
