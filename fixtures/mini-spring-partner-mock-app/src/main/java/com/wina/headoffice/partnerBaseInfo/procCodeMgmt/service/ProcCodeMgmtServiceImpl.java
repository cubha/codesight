package com.wina.headoffice.partnerBaseInfo.procCodeMgmt.service;

import com.wina.headoffice.partnerBaseInfo.procCodeMgmt.repository.ProcCodeMgmtRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ProcCodeMgmtServiceImpl implements ProcCodeMgmtService {
    @Autowired
    private ProcCodeMgmtRepository procCodeMgmtRepository;

    @Override
    public Object retrieveProcCodeList() { return procCodeMgmtRepository.retrieveProcCodeList(); }

    @Override
    public Object saveProcCode() { return procCodeMgmtRepository.insertProcCode(); }
}
