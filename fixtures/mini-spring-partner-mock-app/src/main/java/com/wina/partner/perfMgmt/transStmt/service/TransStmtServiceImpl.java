package com.wina.partner.perfMgmt.transStmt.service;

import com.wina.partner.perfMgmt.transStmt.repository.TransStmtRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TransStmtServiceImpl implements TransStmtService {
    @Autowired
    private TransStmtRepository transStmtRepository;

    @Override
    public Object retrieveTransStmtList() {
        return transStmtRepository.retrieveTransStmtList();
    }

    @Override
    public Object retrieveTransStmtDetailList() {
        return transStmtRepository.retrieveTransStmtDetailList();
    }

    @Override
    public Object retrieveTransStmtExcelList() {
        return transStmtRepository.retrieveTransStmtExcelList();
    }
}
