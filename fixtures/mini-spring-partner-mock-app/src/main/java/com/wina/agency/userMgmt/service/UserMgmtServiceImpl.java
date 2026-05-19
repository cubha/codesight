package com.wina.agency.userMgmt.service;

import com.wina.agency.userMgmt.repository.UserMgmtRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserMgmtServiceImpl implements UserMgmtService {
    @Autowired
    private UserMgmtRepository userMgmtRepository;

    @Override
    public Object retrieveUserList() { return userMgmtRepository.retrieveUserList(); }

    @Override
    public Object saveUser() { return userMgmtRepository.saveUser(); }

    @Override
    public Object removeUser() { return userMgmtRepository.removeUser(); }
}
