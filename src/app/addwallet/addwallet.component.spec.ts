import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AddwalletComponent } from './addwallet.component';

describe('AddwalletComponent', () => {
  let component: AddwalletComponent;
  let fixture: ComponentFixture<AddwalletComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AddwalletComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AddwalletComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
